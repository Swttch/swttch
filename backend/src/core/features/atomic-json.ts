import { readFile, writeFile, rename, mkdir, stat, chmod, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Safe read-modify-write for JSON files we do not own.
 *
 * Every function here exists because of one incident (issue #386): a user's
 * `~/.claude/settings.json` went from 20 keys to 3. Two separate defects had to
 * line up for that, and both are addressed here.
 *
 * 1. **The write was not atomic.** `writeFile` truncates and then writes. Two
 *    writers overlapping leaves the shorter payload with the tail of the longer
 *    one still behind it, and the file no longer parses. Several backends share
 *    these files — worktree dev servers, a standalone `ccg`, and the IDE plugin
 *    all write `~/.claude/settings.json` — so overlapping writers are ordinary,
 *    not exotic.
 *
 * 2. **"cannot be read" was treated as "is empty".** Returning `{}` for an
 *    unparseable file is reasonable for a reader, and destructive as the read
 *    half of a read-modify-write: the writer puts its one key on that empty
 *    object and saves, and a file we merely failed to read is reborn holding a
 *    single key. Nothing we write can bring the rest back.
 *
 * These files are the user's, not ours. They hold their MCP servers, their
 * status line, their plugin list and their CLI preferences, so the correct
 * answer to "I could not read it" is to refuse the write, not to replace it.
 */

/** What a read for a read-modify-write found. */
export type JsonReadForUpdate =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'unreadable'; reason: string };

/** Outcome of an attempted update. */
export type JsonUpdateResult = { status: 'ok' } | { status: 'error'; error: string };

/**
 * Mutate the parsed contents in place or return a replacement.
 * Returning `null` means "nothing to change" and skips the write entirely.
 */
export type JsonMutate = (
  current: Record<string, unknown>,
) => Record<string, unknown> | null;

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * Read a JSON file as the read half of a read-modify-write, reporting an absent
 * file and an unreadable one as different things.
 *
 * An existing-but-EMPTY file is reported as `ok` with no keys. It is the one
 * shape where nothing can be lost by writing: there is no content to preserve,
 * so refusing would only leave the user unable to save, with nothing gained.
 *
 * Valid JSON is not the same thing as a settings object. `null`, `[1,2,3]` and
 * `"text"` all parse, and none of them is something a key can be written onto,
 * so each counts as unreadable rather than as an empty object.
 */
export async function readJsonForUpdate(filePath: string): Promise<JsonReadForUpdate> {
  if (!existsSync(filePath)) return { status: 'ok', data: {} };

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    return { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  }

  if (raw.trim() === '') return { status: 'ok', data: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'unreadable', reason: `expected a JSON object, found ${describeValue(parsed)}` };
  }
  return { status: 'ok', data: parsed as Record<string, unknown> };
}

let tmpCounter = 0;

/**
 * Windows can fail a rename while an antivirus scanner, a file indexer or
 * another process still holds the target open. The condition is transient, so a
 * short backoff turns a spurious save failure into a save.
 */
const RENAME_RETRY_DELAYS_MS = [10, 40, 120];
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = errorCode(err);
      if (attempt >= RENAME_RETRY_DELAYS_MS.length || !code || !RETRYABLE_RENAME_CODES.has(code)) {
        throw err;
      }
      await delay(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * Write via a temp file in the same directory and `rename()` it over the target,
 * so a reader sees either the old file or the new one and never a half-written
 * one. The temp file has to be a sibling: `rename` is only atomic within one
 * filesystem, and a temp directory can be on another.
 *
 * The target's permission bits are carried over, because the rename replaces the
 * file itself rather than its contents. Without this, a file the user had locked
 * down to 600 would come back readable by everyone.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });

  let mode: number | undefined;
  try {
    mode = (await stat(filePath)).mode & 0o777;
  } catch {
    // No existing file, so there are no bits to preserve.
  }

  const tmp = `${filePath}.tmp-${process.pid}-${tmpCounter++}`;
  try {
    await writeFile(tmp, content, 'utf-8');
    if (mode !== undefined) await chmod(tmp, mode);
    await renameWithRetry(tmp, filePath);
  } catch (err) {
    // Clearing the temp file must not replace the reason the write failed: that
    // reason is what the caller reports, and a cleanup problem on top of it says
    // nothing about why the save did not happen.
    try {
      await unlink(tmp);
    } catch {
      // Nothing to remove, or it could not be removed. Either way, `err` stands.
    }
    throw err;
  }
}

/**
 * Serializes updates per file path. Two read-modify-write cycles of our own
 * overlapping would read the same starting content and the second write would
 * drop the first one's key, so each path gets a chain that one update finishes
 * before the next begins.
 *
 * Keyed by the resolved path, so two spellings of the same file share a chain.
 * Cross-process overlap is not what this solves — the atomic rename is.
 */
const updateChains = new Map<string, Promise<unknown>>();

/**
 * Read a JSON file, apply `mutate`, and save the result atomically.
 *
 * A file that exists but cannot be read aborts the update: it is reported as an
 * error and left exactly as it was found.
 */
export function updateJsonFile(filePath: string, mutate: JsonMutate): Promise<JsonUpdateResult> {
  const key = resolve(filePath);
  const previous = updateChains.get(key) ?? Promise.resolve();
  const run = previous.then(() => doUpdateJsonFile(filePath, mutate));
  // Keep the chain alive even if an update fails or its mutate throws.
  updateChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function doUpdateJsonFile(filePath: string, mutate: JsonMutate): Promise<JsonUpdateResult> {
  const read = await readJsonForUpdate(filePath);
  if (read.status === 'unreadable') {
    const error = `refusing to overwrite ${filePath}: it exists but could not be read (${read.reason})`;
    console.error('[node-backend]', error);
    return { status: 'error', error };
  }

  try {
    const next = mutate(read.data);
    if (next === null) return { status: 'ok' };
    await atomicWriteFile(filePath, JSON.stringify(next, null, 2) + '\n');
    return { status: 'ok' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', `failed to update ${filePath}:`, err);
    return { status: 'error', error };
  }
}
