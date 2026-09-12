import { randomUUID } from 'crypto';
import { readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import {
  PROMPT_CATEGORY_MAX_LENGTH,
  parseCategoryRecords,
  resolvePromptStoreFile,
  type PromptCategory,
  type PromptScope,
} from './prompts';
import { updateJsonFile } from './atomic-json';

/**
 * The category records, kept apart from the prompts that reference them.
 *
 * Two reasons they are records with ids rather than bare names. A category the
 * user creates from the sidebar has no prompt in it yet, so a name written only
 * on prompts would have nothing to hang on and would vanish when the screen
 * closed. And a name written on every prompt would have to be rewritten on all
 * of them whenever it changed, across both scopes — a rewrite that fails halfway
 * leaves the two disagreeing. The name lives here, once.
 *
 * The records live in the GLOBAL store even for project prompts, because a
 * category is a dimension of its own, independent of scope, and the global store
 * is the one that exists whether or not a project is open.
 */

/** Where the records are read and written. Project scope has no list of its own. */
const REGISTRY_SCOPE: PromptScope = 'global';

export type CategoryResult =
  | { status: 'ok'; categories: PromptCategory[] }
  | { status: 'error'; error: string };

/**
 * Whether two names are the same category.
 *
 * Case-insensitive, because "Debug" and "debug" are one category in every head
 * but the computer's, and letting both exist is how a taxonomy rots.
 */
export function isSameCategoryName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Category name must not be empty';
  if (trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) {
    return `Category name must be at most ${PROMPT_CATEGORY_MAX_LENGTH} characters`;
  }
  return null;
}

/**
 * Read the stored records.
 *
 * An absent or unreadable file is an empty list, because a READ has nothing to
 * lose; the write path below refuses rather than replacing (see atomic-json).
 */
export async function listCategories(): Promise<PromptCategory[]> {
  const resolved = resolvePromptStoreFile(REGISTRY_SCOPE);
  if (resolved.status === 'error') return [];
  try {
    const raw = await readFile(resolved.filePath, 'utf-8');
    return parseCategoryRecords((JSON.parse(raw) as Record<string, unknown>).categories);
  } catch {
    return [];
  }
}

/** Run a read-modify-write over the stored records. */
async function mutateRegistry(
  mutate: (categories: PromptCategory[]) => PromptCategory[] | string,
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = resolvePromptStoreFile(REGISTRY_SCOPE);
  if (resolved.status === 'error') return resolved;

  let mutationError: string | null = null;
  try {
    await mkdir(dirname(resolved.filePath), { recursive: true });
    const result = await updateJsonFile(resolved.filePath, (current) => {
      const next = mutate(parseCategoryRecords(current.categories));
      if (typeof next === 'string') {
        mutationError = next;
        return null;
      }
      current.categories = next as unknown as Record<string, unknown>[];
      return current;
    });
    if (mutationError !== null) return { status: 'error', error: mutationError };
    return result.status === 'ok' ? { status: 'ok' } : { status: 'error', error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to write prompt categories:', err);
    return { status: 'error', error };
  }
}

/** Add a category, which starts with no prompts in it. */
export async function createCategory(name: string): Promise<CategoryResult> {
  const invalid = validateName(name);
  if (invalid) return { status: 'error', error: invalid };

  const record: PromptCategory = {
    id: randomUUID(),
    name: name.trim(),
    createdAt: Date.now(),
  };

  let rejected: string | null = null;
  const written = await mutateRegistry((categories) => {
    if (categories.some((category) => isSameCategoryName(category.name, record.name))) {
      rejected = 'Category already exists';
      return rejected;
    }
    return [...categories, record];
  });
  if (written.status === 'error') return written;
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Rename a category.
 *
 * One record changes and every prompt that references it follows, because they
 * reference the id. Renaming onto a name that already exists is refused rather
 * than merging the two, which would be a bigger change than the user asked for.
 */
export async function renameCategory(id: string, name: string): Promise<CategoryResult> {
  const invalid = validateName(name);
  if (invalid) return { status: 'error', error: invalid };
  const trimmed = name.trim();

  let failure: string | null = null;
  const written = await mutateRegistry((categories) => {
    const index = categories.findIndex((category) => category.id === id);
    if (index === -1) {
      failure = `Category not found: ${id}`;
      return failure;
    }
    const clash = categories.some(
      (category) => category.id !== id && isSameCategoryName(category.name, trimmed),
    );
    if (clash) {
      failure = 'Category already exists';
      return failure;
    }
    const next = [...categories];
    next[index] = { ...(categories[index] as PromptCategory), name: trimmed };
    return next;
  });
  if (written.status === 'error') return written;
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Remove a category.
 *
 * Only the record goes. The prompts that referenced it keep a dangling id,
 * which reads as uncategorised — deleting the saved phrases along with a
 * grouping the user tidied up would be a surprise nobody asked for, and
 * rewriting every prompt to strip the id is the very work ids exist to avoid.
 */
export async function deleteCategory(id: string): Promise<CategoryResult> {
  const written = await mutateRegistry((categories) =>
    categories.filter((category) => category.id !== id),
  );
  if (written.status === 'error') return written;
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Find or create the categories for a set of names, answering with their ids.
 *
 * This is the import path: a library arriving from another machine carries ids
 * that mean nothing here, so its categories are matched by NAME against what
 * this machine already has and created when there is no match. Matching by name
 * is right precisely because the id is local.
 */
export async function resolveCategoryIdsByName(names: string[]): Promise<Map<string, string>> {
  const wanted: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) continue;
    if (!wanted.some((existing) => isSameCategoryName(existing, trimmed))) wanted.push(trimmed);
  }
  if (wanted.length === 0) return new Map();

  const created: PromptCategory[] = [];
  await mutateRegistry((categories) => {
    const next = [...categories];
    for (const name of wanted) {
      if (next.some((category) => isSameCategoryName(category.name, name))) continue;
      const record: PromptCategory = { id: randomUUID(), name, createdAt: Date.now() };
      next.push(record);
      created.push(record);
    }
    return next;
  });

  const all = await listCategories();
  const byName = new Map<string, string>();
  for (const name of wanted) {
    const match = all.find((category) => isSameCategoryName(category.name, name));
    if (match) byName.set(name, match.id);
  }
  return byName;
}
