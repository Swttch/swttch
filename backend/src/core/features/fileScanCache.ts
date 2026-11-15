import { stat } from 'fs/promises';

/**
 * Remembering what was read from a file for as long as the file is as it was.
 *
 * A transcript is only ever appended to, so what was read from it stays right while its size and its
 * modification time are what they were. A list of sessions reads the start and the end of hundreds of
 * transcripts every time it is asked for, and almost none of them changed since the last time, so asking
 * the file system how each one looks now costs a fraction of reading it again.
 *
 * What is kept is whatever the reading returned: callers must not change it.
 */

/** The most files remembered, by each kind of reading. Enough for every session of a heavy user. */
const DEFAULT_MAX_ENTRIES = 4_000;

interface Entry {
  mtimeMs: number;
  size: number;
  value: unknown;
}

export type FileScanCache = <T>(kind: string, file: string, scan: () => Promise<T>) => Promise<T>;

export function createFileScanCache(maxEntries: number = DEFAULT_MAX_ENTRIES): FileScanCache {
  const entries = new Map<string, Entry>();

  return async <T>(kind: string, file: string, scan: () => Promise<T>): Promise<T> => {
    let before;
    try {
      before = await stat(file);
    } catch {
      // The file cannot be looked at: let the reading say why, as it would without the cache.
      return scan();
    }

    const key = `${kind}\0${file}`;
    const hit = entries.get(key);
    if (hit && hit.mtimeMs === before.mtimeMs && hit.size === before.size) {
      // Looked at now, so it is the newest.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value as T;
    }

    const value = await scan();
    // Kept under how the file looked BEFORE it was read: a file that grew while it was read looks
    // different next time, and is read again rather than trusted.
    entries.delete(key);
    entries.set(key, { mtimeMs: before.mtimeMs, size: before.size, value });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    return value;
  };
}

/** The cache the readers of transcripts share. */
export const scanFileCached: FileScanCache = createFileScanCache();
