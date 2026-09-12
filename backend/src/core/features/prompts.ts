import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { updateJsonFile } from './atomic-json';

/**
 * The prompt library: phrases the user saves once and pastes into the composer
 * with `!!`, instead of retyping them every session.
 *
 * This is OUR store, not the CLI's. The Claude Code CLI has no equivalent
 * feature — its custom slash commands under `.claude/commands/` are EXECUTED
 * when sent, while a saved prompt is text the user pastes, reads and edits
 * before sending. Keeping the two apart is deliberate: writing saved phrases
 * into `.claude/commands/` would make every one of them an executable command
 * in the CLI's `/` list, which is not what the user asked the library to be.
 *
 * The layout mirrors the app settings exactly (see features/settings.ts):
 * global lives under the user data directory, project lives beside the project.
 */

/** Where one prompt is stored. Independent of any category it may carry later. */
export type PromptScope = 'global' | 'project';

/** One saved prompt, exactly as it is stored on disk. */
export interface SavedPrompt {
  /** Stable identifier, assigned on creation and never rewritten. */
  id: string;
  /** Display name, shown in the `!!` panel and on the settings card. */
  name: string;
  /** The text pasted into the composer when the user picks this prompt. */
  content: string;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
  /** Last edit time in epoch milliseconds. Equals createdAt until first edit. */
  updatedAt: number;
  /**
   * The ids of the categories this prompt belongs to, or absent for the
   * uncategorised group.
   *
   * Ids, not names: a name written here would have to be rewritten on every
   * prompt that carries it whenever the user renames the category, across both
   * scopes, and a rewrite that fails halfway leaves the two disagreeing. The
   * name lives in one {@link PromptCategory} record instead.
   *
   * A list rather than one id: "review this diff" is both a review prompt and a
   * git prompt, and making the user pick one would push them into inventing a
   * category that means both.
   *
   * Optional, so a store written before categories existed reads back unchanged
   * and needs no migration. An id with no record behind it is ignored rather
   * than shown, which is what makes reading a store safe to do without writing.
   */
  categories?: string[];
}

/**
 * One category, named once and referenced by id.
 *
 * Stored in the GLOBAL store even when only project prompts use it: a category
 * is a dimension of its own, independent of scope, so one taxonomy spans both
 * and the global store is the one that exists whether or not a project is open.
 */
export interface PromptCategory {
  /** Ours to generate; the same shape as a prompt id. */
  id: string;
  /** What the user called it. The only place this name is written. */
  name: string;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
}

export type PromptResult =
  | { status: 'ok'; prompt: SavedPrompt }
  | { status: 'error'; error: string };

export type PromptDeleteResult =
  | { status: 'ok' }
  | { status: 'error'; error: string };

/**
 * Name and content limits.
 *
 * The name sits on one row of a dropdown, so it has to stay scannable; 60
 * characters is long enough for a sentence-shaped Korean name and still short
 * enough to read at a glance. The content limit only exists to stop a pasted
 * file from becoming a prompt by accident.
 */
export const PROMPT_NAME_MAX_LENGTH = 60;
/** Same reasoning as the name: a category sits on one sidebar row. */
export const PROMPT_CATEGORY_MAX_LENGTH = 60;
/**
 * A ceiling on how many categories one prompt may carry.
 *
 * Not a design limit so much as a guard: the field is free text arriving over
 * IPC, and a list with no bound is a list something can fill.
 */
export const PROMPT_CATEGORIES_MAX_COUNT = 20;
export const PROMPT_CONTENT_MAX_LENGTH = 100000;

/** Ids are ours to generate, so reject anything that did not come from us. */
const VALID_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

const STORE_FILE_NAME = 'prompts.json';
const DATA_DIR_NAME = '.claude-code-gui';

function globalStoreFile(): string {
  return join(homedir(), DATA_DIR_NAME, STORE_FILE_NAME);
}

function projectStoreFile(projectPath: string): string {
  return join(projectPath, DATA_DIR_NAME, STORE_FILE_NAME);
}

function storeDirectory(scope: PromptScope, projectPath?: string): string {
  return scope === 'project'
    ? join(projectPath as string, DATA_DIR_NAME)
    : join(homedir(), DATA_DIR_NAME);
}

/**
 * Resolve the file one scope reads and writes, or an error when the caller asked
 * for project scope without naming a project.
 */
export function resolvePromptStoreFile(
  scope: PromptScope,
  projectPath?: string,
): { status: 'ok'; filePath: string } | { status: 'error'; error: string } {
  if (scope === 'project') {
    if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
    return { status: 'ok', filePath: projectStoreFile(projectPath) };
  }
  return { status: 'ok', filePath: globalStoreFile() };
}

/**
 * Keep only the entries that are actually prompts, dropping anything a hand edit
 * or a future field rename left behind. A malformed entry must not take the
 * whole list down with it: the user would see an empty library and assume every
 * prompt was lost.
 */
/**
 * Read the category ids written on a prompt.
 *
 * Only well-formed ids are kept. An id with no record behind it is left in the
 * list and ignored when the name is looked up, rather than being dropped here:
 * reading must not quietly edit a store, and a record that is merely missing
 * today may be back tomorrow (a project opened without its global store, a file
 * mid-sync).
 *
 * Duplicates are collapsed, because one category twice on one prompt would file
 * it under the same heading twice.
 */
export function parseCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!VALID_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= PROMPT_CATEGORIES_MAX_COUNT) break;
  }
  return ids;
}

/** Read the stored category records, dropping anything that is not one. */
export function parseCategoryRecords(value: unknown): PromptCategory[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const categories: PromptCategory[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const { id, name, createdAt } = candidate;
    if (typeof id !== 'string' || !VALID_ID_PATTERN.test(id) || seenIds.has(id)) continue;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) continue;
    seenIds.add(id);
    categories.push({
      id,
      name: trimmed,
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
    });
  }
  return categories;
}

function parseStoredPrompts(value: unknown): SavedPrompt[] {
  if (!Array.isArray(value)) return [];
  const prompts: SavedPrompt[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const { id, name, content, createdAt, updatedAt } = candidate;
    if (typeof id !== 'string' || !VALID_ID_PATTERN.test(id)) continue;
    if (typeof name !== 'string' || typeof content !== 'string') continue;
    const categories = parseCategoryIds(candidate.categories);
    prompts.push({
      id,
      name,
      content,
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
      ...(categories.length === 0 ? {} : { categories }),
    });
  }
  return prompts;
}

/**
 * Read one scope's prompts, newest first.
 *
 * An absent file and an unreadable one both read as an empty list, because a
 * READ has nothing to lose — the write path is where an unreadable file must
 * refuse rather than replace (see atomic-json).
 */
export async function readPrompts(scope: PromptScope, projectPath?: string): Promise<SavedPrompt[]> {
  const resolved = resolvePromptStoreFile(scope, projectPath);
  if (resolved.status === 'error') return [];

  try {
    if (!existsSync(resolved.filePath)) return [];
    const raw = await readFile(resolved.filePath, 'utf-8');
    if (raw.trim() === '') return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prompts = parseStoredPrompts(parsed?.prompts);
    return [...prompts].sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('[node-backend]', 'Failed to read prompts:', err);
    return [];
  }
}

function validateNameAndContent(name: string, content: string): string | null {
  const trimmedName = name.trim();
  if (trimmedName === '') return 'Prompt name must not be empty';
  if (trimmedName.length > PROMPT_NAME_MAX_LENGTH) {
    return `Prompt name must be at most ${PROMPT_NAME_MAX_LENGTH} characters`;
  }
  if (content === '') return 'Prompt content must not be empty';
  if (content.length > PROMPT_CONTENT_MAX_LENGTH) {
    return `Prompt content must be at most ${PROMPT_CONTENT_MAX_LENGTH} characters`;
  }
  return null;
}

/**
 * Run a read-modify-write over one scope's store through {@link updateJsonFile},
 * so an unreadable file aborts the save instead of being overwritten by the one
 * entry being written.
 *
 * Exported so prompt-transfer.ts can fold an imported set in through the same
 * path every other write uses. The dependency runs one way: this module owns the
 * store and knows nothing about files being carried in or out.
 */
export async function mutatePromptStore(
  scope: PromptScope,
  projectPath: string | undefined,
  mutate: (prompts: SavedPrompt[]) => SavedPrompt[] | string,
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = resolvePromptStoreFile(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  let mutationError: string | null = null;
  try {
    await mkdir(storeDirectory(scope, projectPath), { recursive: true });
    const result = await updateJsonFile(resolved.filePath, (current) => {
      const next = mutate(parseStoredPrompts(current.prompts));
      if (typeof next === 'string') {
        mutationError = next;
        return null;
      }
      current.prompts = next;
      return current;
    });
    if (mutationError !== null) return { status: 'error', error: mutationError };
    return result.status === 'ok' ? { status: 'ok' } : { status: 'error', error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to write prompts:', err);
    return { status: 'error', error };
  }
}

/** Add one prompt to a scope. The backend owns the id and both timestamps. */
export async function createPrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };

  const now = Date.now();
  const parsed = parseCategoryIds(categories);
  const prompt: SavedPrompt = {
    id: randomUUID(),
    name: name.trim(),
    content,
    createdAt: now,
    updatedAt: now,
    // Absent rather than empty, so "no category" is one value on disk.
    ...(parsed.length === 0 ? {} : { categories: parsed }),
  };

  const written = await mutatePromptStore(scope, projectPath, (prompts) => [...prompts, prompt]);
  if (written.status === 'error') return written;
  return { status: 'ok', prompt };
}

/**
 * Edit one prompt's name, content and categories. `id` and `createdAt` are not
 * editable:
 * the id is what the webview's cached rows are keyed by, and a creation time
 * that moves would reshuffle the newest-first order the user just looked at.
 */
export async function updatePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };

  let updated: SavedPrompt | null = null;
  const written = await mutatePromptStore(scope, projectPath, (prompts) => {
    const index = prompts.findIndex((prompt) => prompt.id === id);
    if (index === -1) return `Prompt not found: ${id}`;
    const existing = prompts[index] as SavedPrompt;
    const parsed = parseCategoryIds(categories);
    // Spread first, then drop the key when the list came back empty: leaving
    // the old value in place would make a category impossible to remove.
    updated = { ...existing, name: name.trim(), content, updatedAt: Date.now() };
    if (parsed.length === 0) delete updated.categories;
    else updated.categories = parsed;
    const next = [...prompts];
    next[index] = updated;
    return next;
  });
  if (written.status === 'error') return written;
  if (updated === null) return { status: 'error', error: `Prompt not found: ${id}` };
  return { status: 'ok', prompt: updated };
}

/** Remove one prompt from a scope. Deleting an absent id is an error, not a no-op. */
export async function deletePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
): Promise<PromptDeleteResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };

  return mutatePromptStore(scope, projectPath, (prompts) => {
    const next = prompts.filter((prompt) => prompt.id !== id);
    if (next.length === prompts.length) return `Prompt not found: ${id}`;
    return next;
  });
}
