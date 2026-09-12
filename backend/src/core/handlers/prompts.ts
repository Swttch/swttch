import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { resolveWslCwd } from '../wsl-path';
import { readFile } from 'fs/promises';
import {
  readPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  type PromptScope,
  type SavedPrompt,
} from '../features/prompts';
import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from '../features/prompt-category-registry';
import {
  buildExportFile,
  extractCategoryRecords,
  remapImportedCategories,
  exportFileName,
  parseImportFile,
  buildImportPreview,
  normaliseImportedPrompt,
  importPromptsIntoStore,
  type ConflictStrategy,
} from '../features/prompt-transfer';

/**
 * Prompt library request handlers. The store itself lives in features/prompts.ts;
 * these four only read the payload, call it and answer.
 */

function readScope(message: IPCMessage): PromptScope {
  return message.payload?.scope === 'project' ? 'project' : 'global';
}

/**
 * The project path a 'project'-scope request applies to, or undefined for global
 * scope.
 *
 * The WSL conversion is the same one the `@` mention index needs (issue #195): in
 * JetBrains mode a WSL project's backend runs inside the distro, while the IDE
 * sends the project root as a Windows UNC path that does not exist there. Without
 * the conversion a WSL user's project prompts would be written to a path that
 * cannot be read back.
 */
function readProjectPath(message: IPCMessage): string | undefined {
  const raw = message.payload?.workingDir;
  if (typeof raw !== 'string' || raw === '') return undefined;
  return (resolveWslCwd(raw) as string) ?? raw;
}

function sendOk(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  extra: Record<string, unknown>,
): void {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...extra,
  });
}

function sendError(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  error: string,
): void {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'error',
    error,
  });
}

export async function getPromptsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);

  // Project scope without a project is not an error the user can act on: the
  // chat simply has no working directory yet. Answer with an empty list so the
  // panel shows the global prompts instead of an error row.
  if (scope === 'project' && !projectPath) {
    sendOk(connections, connectionId, message, { scope, prompts: [] });
    return;
  }

  const prompts = await readPrompts(scope, projectPath);
  sendOk(connections, connectionId, message, { scope, prompts });
}

export async function createPromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);
  const name = (message.payload?.name as string) ?? '';
  const content = (message.payload?.content as string) ?? '';
  const categories = message.payload?.categories;

  const result = await createPrompt(scope, projectPath, name, content, categories);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { scope, prompt: result.prompt });
}

export async function updatePromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);
  const id = (message.payload?.id as string) ?? '';
  const name = (message.payload?.name as string) ?? '';
  const content = (message.payload?.content as string) ?? '';
  const categories = message.payload?.categories;

  const result = await updatePrompt(scope, projectPath, id, name, content, categories);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { scope, prompt: result.prompt });
}

export async function deletePromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);
  const id = (message.payload?.id as string) ?? '';

  const result = await deletePrompt(scope, projectPath, id);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { scope, id });
}

/**
 * Write the chosen prompts to a file the user picks.
 *
 * The save dialog is the host's, reached through the Bridge, so the same code
 * path serves an IDE tab and a browser tab. A cancelled dialog answers with a
 * null path rather than an error: the user saying no is not a failure.
 */
export async function exportPromptsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);

  const stored = await readPrompts(scope, projectPath);
  const requested = message.payload?.ids;
  // No ids means "all of them", which is what the header button does.
  const chosen =
    Array.isArray(requested) && requested.length > 0
      ? stored.filter((prompt) => (requested as string[]).includes(prompt.id))
      : stored;

  if (chosen.length === 0) {
    sendError(connections, connectionId, message, 'no-prompts');
    return;
  }

  const now = new Date();
  const file = buildExportFile(chosen, await listCategories(), now);
  const result = await bridge.saveFile({
    suggestedName: exportFileName(now),
    contents: `${JSON.stringify(file, null, 2)}\n`,
  });

  sendOk(connections, connectionId, message, { path: result.path, count: chosen.length });
}

/**
 * Read a prompt file the user picks and say what importing it would do.
 *
 * Nothing is written here. The preview is what lets the user choose a conflict
 * strategy knowing how many prompts it applies to.
 */
export async function previewPromptImportHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);

  const picked = await bridge.pickFiles({ mode: 'files', multiple: false });
  const filePath = picked.paths[0];
  if (!filePath) {
    // Cancelled. Not an error, and not a preview either.
    sendOk(connections, connectionId, message, { cancelled: true });
    return;
  }

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    console.error('[node-backend]', 'Failed to read prompt file:', err);
    sendError(connections, connectionId, message, 'unreadable-file');
    return;
  }

  const parsed = parseImportFile(raw);
  if (parsed.status === 'error') {
    sendError(connections, connectionId, message, parsed.error);
    return;
  }

  // The file's category ids are the exporting machine's, so they are matched by
  // name and rewritten before the preview shows what would land.
  const remapped = await remapImportedCategories(parsed.prompts, extractCategoryRecords(JSON.parse(raw)));
  const existing = await readPrompts(scope, projectPath);
  const preview = buildImportPreview(remapped, existing);
  sendOk(connections, connectionId, message, { scope, ...preview });
}

/** Apply a previewed import with the strategy the user chose. */
export async function importPromptsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const scope = readScope(message);
  const projectPath = readProjectPath(message);

  const incoming = message.payload?.prompts;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    sendError(connections, connectionId, message, 'no-prompts');
    return;
  }

  const rawStrategy = message.payload?.strategy;
  const strategy: ConflictStrategy =
    rawStrategy === 'overwrite' || rawStrategy === 'duplicate' ? rawStrategy : 'skip';

  // The list came back from our own preview, but it made a round trip through
  // the webview, so it is read again rather than trusted.
  const now = Date.now();
  const prompts = incoming
    .map((entry) => normaliseImportedPrompt(entry, now))
    .filter((prompt): prompt is SavedPrompt => prompt !== null);

  if (prompts.length === 0) {
    sendError(connections, connectionId, message, 'no-prompts');
    return;
  }

  const result = await importPromptsIntoStore(scope, projectPath, prompts, strategy);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }

  sendOk(connections, connectionId, message, {
    scope,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
  });
}

/**
 * The category handlers.
 *
 * All four answer with the full list rather than with what changed, because the
 * sidebar draws the whole list and a diff would only give it a second way to be
 * wrong.
 */
export async function getPromptCategoriesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const categories = await listCategories();
  sendOk(connections, connectionId, message, { categories });
}

export async function createPromptCategoryHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const name = (message.payload?.name as string) ?? '';
  const result = await createCategory(name);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { categories: result.categories });
}

export async function renamePromptCategoryHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const id = (message.payload?.id as string) ?? '';
  const name = (message.payload?.name as string) ?? '';
  const result = await renameCategory(id, name);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { categories: result.categories });
}

export async function deletePromptCategoryHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const id = (message.payload?.id as string) ?? '';
  const result = await deleteCategory(id);
  if (result.status === 'error') {
    sendError(connections, connectionId, message, result.error);
    return;
  }
  sendOk(connections, connectionId, message, { categories: result.categories });
}
