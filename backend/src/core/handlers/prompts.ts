import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { resolveWslCwd } from '../wsl-path';
import {
  readPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  type PromptScope,
} from '../features/prompts';

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

  const result = await createPrompt(scope, projectPath, name, content);
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

  const result = await updatePrompt(scope, projectPath, id, name, content);
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
