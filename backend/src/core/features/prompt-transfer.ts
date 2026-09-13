import { randomUUID } from 'crypto';
import {
  PROMPT_NAME_MAX_LENGTH,
  PROMPT_CONTENT_MAX_LENGTH,
  parseCategoryIds,
  parseCategoryRecords,
  mutatePromptStore,
  type PromptCategory,
  type PromptScope,
  type SavedPrompt,
} from './prompts';
import { listCategories, resolveCategoryIdsByName } from './prompt-category-registry';

/**
 * Reading and writing a prompt library as one file, so a set of prompts can move
 * between machines or between people.
 *
 * The reader is deliberately generous about what a prompt file looks like. Ours
 * is not the only tool that saves prompts, and a user arriving with a library
 * they already built elsewhere should not have to hand-edit JSON to bring it
 * across. The writer, in contrast, emits exactly one shape.
 */

/** Marks a file this feature wrote. Read, never required. */
export const PROMPT_EXPORT_FORMAT = 'claude-code-prompts-export-v1';

/** The file this feature writes. */
export interface PromptExportFile {
  format: string;
  exportTime: string;
  promptCount: number;
  prompts: SavedPrompt[];
  /**
   * The category records the exported prompts reference.
   *
   * Without them the ids on those prompts would mean nothing on the machine
   * that reads the file: the names live only here.
   */
  categories: PromptCategory[];
}

/** What one incoming prompt would do to the library it is imported into. */
export type ImportItemStatus = 'new' | 'update';

export interface ImportItem {
  prompt: SavedPrompt;
  status: ImportItemStatus;
}

export interface ImportPreview {
  items: ImportItem[];
  newCount: number;
  updateCount: number;
}

/** What to do with an incoming prompt whose id is already in the library. */
export type ConflictStrategy = 'skip' | 'overwrite' | 'duplicate';

export type ParseImportResult =
  | { status: 'ok'; prompts: SavedPrompt[] }
  | { status: 'error'; error: string };

/**
 * Build the file contents for [prompts].
 *
 * `prompts` is an array here even though a reader must also accept an object,
 * because an array is the shape that keeps the order the user sees.
 */
export function buildExportFile(
  prompts: SavedPrompt[],
  categories: PromptCategory[] = [],
  now: Date = new Date(),
): PromptExportFile {
  // Only the records actually referenced: exporting three prompts should not
  // hand the reader the author's whole taxonomy.
  const used = new Set(prompts.flatMap((prompt) => prompt.categories ?? []));
  return {
    format: PROMPT_EXPORT_FORMAT,
    exportTime: now.toISOString(),
    promptCount: prompts.length,
    prompts,
    categories: categories.filter((category) => used.has(category.id)),
  };
}

/** The default file name offered in the save dialog. */
export function exportFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '');
  return `prompts-${stamp}.json`;
}

/**
 * Pull the prompt list out of a parsed prompt file, whichever shape it is in.
 *
 * Three shapes are accepted, and they are all real:
 *
 *   1. `{ format, prompts: [...] }` — a file this feature wrote.
 *   2. `{ prompts: [...] }` — our own on-disk store, copied by hand.
 *   3. `{ prompts: { "<id>": {...} } }` — another tool's on-disk store, which
 *      keys its prompts by id instead of listing them.
 *
 * The `format` envelope is read but never required. Demanding it would shut out
 * shapes 2 and 3, which are exactly the files a user already has sitting on
 * their disk, and the point of import is to accept those.
 */
export function extractPromptEntries(parsed: unknown): unknown[] | null {
  if (parsed === null || typeof parsed !== 'object') return null;

  // A bare array is not a shape anything writes, but it costs nothing to read
  // and is what a user who trimmed the wrapper by hand would leave behind.
  if (Array.isArray(parsed)) return parsed;

  const container = (parsed as Record<string, unknown>).prompts;
  if (Array.isArray(container)) return container;

  if (container !== null && typeof container === 'object') {
    // Keyed by id. The key is the identity, so an entry missing its own `id`
    // field takes the key's — that is how the other tool's store reads it back.
    return Object.entries(container as Record<string, unknown>).map(([key, value]) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
      const entry = value as Record<string, unknown>;
      return entry.id === undefined ? { ...entry, id: key } : entry;
    });
  }

  return null;
}

/**
 * Normalise one incoming entry into a prompt, or return null when it is not one.
 *
 * A malformed entry is dropped rather than failing the whole file: one bad row
 * in a shared library must not cost the user the other fifty. Ids that did not
 * come from us are replaced rather than rejected, because an id is ours to
 * generate and another tool's format for one is not our business.
 */
export function normaliseImportedPrompt(entry: unknown, now: number): SavedPrompt | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const candidate = entry as Record<string, unknown>;

  const { name, content } = candidate;
  if (typeof name !== 'string' || typeof content !== 'string') return null;
  if (name.trim() === '' || content.trim() === '') return null;
  if (name.length > PROMPT_NAME_MAX_LENGTH) return null;
  if (content.length > PROMPT_CONTENT_MAX_LENGTH) return null;

  const rawId = candidate.id;
  const id = typeof rawId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(rawId) ? rawId : randomUUID();

  const createdAt = typeof candidate.createdAt === 'number' ? candidate.createdAt : now;
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : createdAt;
  // Kept as written. These are the FILE's ids, which are remapped to this
  // machine's by {@link remapImportedCategories} before anything is stored.
  const categories = parseCategoryIds(candidate.categories);

  return {
    id,
    name,
    content,
    createdAt,
    updatedAt,
    ...(categories.length === 0 ? {} : { categories }),
  };
}

/**
 * Read a prompt file's raw text into a list of prompts.
 *
 * Returns an error only when nothing usable could be read at all, so the caller
 * can say why instead of showing an empty preview and leaving the user guessing.
 */
export function parseImportFile(raw: string, now: number = Date.now()): ParseImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'error', error: 'not-json' };
  }

  const entries = extractPromptEntries(parsed);
  if (entries === null) return { status: 'error', error: 'unrecognised-shape' };

  const prompts: SavedPrompt[] = [];
  for (const entry of entries) {
    const prompt = normaliseImportedPrompt(entry, now);
    if (prompt !== null) prompts.push(prompt);
  }

  if (prompts.length === 0) return { status: 'error', error: 'no-prompts' };
  return { status: 'ok', prompts };
}

/**
 * Pull the category records out of a parsed prompt file.
 *
 * Absent in a file written before categories existed, and in one written by
 * another tool, which is why this answers with an empty list rather than
 * failing.
 */
export function extractCategoryRecords(parsed: unknown): PromptCategory[] {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return parseCategoryRecords((parsed as Record<string, unknown>).categories);
}

/**
 * Rewrite the incoming prompts' category ids into this machine's.
 *
 * The file's ids are the exporting machine's and collide with nothing here by
 * design, so each is looked up in the file's own records to get its NAME, and
 * the name is matched against this machine's categories — creating the ones it
 * does not have. An id whose record the file did not carry is dropped, because
 * there is no name to match it by and a dangling id would file the prompt under
 * a heading that can never appear.
 */
export async function remapImportedCategories(
  prompts: SavedPrompt[],
  records: PromptCategory[],
): Promise<SavedPrompt[]> {
  const nameById = new Map(records.map((record) => [record.id, record.name]));
  const wantedNames = [...new Set(prompts.flatMap((prompt) => prompt.categories ?? []))]
    .map((id) => nameById.get(id))
    .filter((name): name is string => name !== undefined);

  if (wantedNames.length === 0) {
    return prompts.map((prompt) => {
      if (!prompt.categories) return prompt;
      const stripped = { ...prompt };
      delete stripped.categories;
      return stripped;
    });
  }

  const idByName = await resolveCategoryIdsByName(wantedNames);
  return prompts.map((prompt) => {
    if (!prompt.categories) return prompt;
    const mapped = prompt.categories
      .map((id) => nameById.get(id))
      .filter((name): name is string => name !== undefined)
      .map((name) => idByName.get(name))
      .filter((id): id is string => id !== undefined);
    const next = { ...prompt };
    if (mapped.length === 0) delete next.categories;
    else next.categories = [...new Set(mapped)];
    return next;
  });
}

/** Mark each incoming prompt as new or as an update of one already stored. */
export function buildImportPreview(
  incoming: SavedPrompt[],
  existing: SavedPrompt[],
): ImportPreview {
  const existingIds = new Set(existing.map((prompt) => prompt.id));
  const items: ImportItem[] = incoming.map((prompt) => ({
    prompt,
    status: existingIds.has(prompt.id) ? 'update' : 'new',
  }));
  return {
    items,
    newCount: items.filter((item) => item.status === 'new').length,
    updateCount: items.filter((item) => item.status === 'update').length,
  };
}

export interface ApplyImportResult {
  prompts: SavedPrompt[];
  imported: number;
  updated: number;
  skipped: number;
}

/**
 * Fold [incoming] into [existing] according to [strategy].
 *
 * Pure, so the three strategies can be checked without touching a file. The
 * caller writes the returned list.
 */
export function applyImport(
  existing: SavedPrompt[],
  incoming: SavedPrompt[],
  strategy: ConflictStrategy,
): ApplyImportResult {
  const result = [...existing];
  const indexById = new Map(result.map((prompt, index) => [prompt.id, index]));
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const prompt of incoming) {
    const conflictIndex = indexById.get(prompt.id);

    if (conflictIndex === undefined) {
      indexById.set(prompt.id, result.length);
      result.push(prompt);
      imported += 1;
      continue;
    }

    if (strategy === 'skip') {
      skipped += 1;
      continue;
    }

    if (strategy === 'overwrite') {
      result[conflictIndex] = prompt;
      updated += 1;
      continue;
    }

    // duplicate: keep both, under an id that is free.
    const copy = { ...prompt, id: randomUUID() };
    indexById.set(copy.id, result.length);
    result.push(copy);
    imported += 1;
  }

  return { prompts: result, imported, updated, skipped };
}

/**
 * Fold an imported set into a scope's store.
 *
 * The fold itself is {@link applyImport} and is pure, so the three strategies
 * are checked without touching a file; this only carries the result through the
 * same read-modify-write every other prompt write uses.
 */
export async function importPromptsIntoStore(
  scope: PromptScope,
  projectPath: string | undefined,
  incoming: SavedPrompt[],
  strategy: ConflictStrategy,
): Promise<
  | { status: 'ok'; imported: number; updated: number; skipped: number }
  | { status: 'error'; error: string }
> {
  let outcome: ApplyImportResult | null = null;

  const written = await mutatePromptStore(scope, projectPath, (prompts) => {
    outcome = applyImport(prompts, incoming, strategy);
    return outcome.prompts;
  });

  if (written.status === 'error') return written;
  if (outcome === null) return { status: 'error', error: 'Import did not run' };

  const { imported, updated, skipped } = outcome as ApplyImportResult;
  return { status: 'ok', imported, updated, skipped };
}
