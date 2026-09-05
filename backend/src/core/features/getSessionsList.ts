import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { extractSessionInfo, scanTail, type SessionInfo } from './extractSessionInfo';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { readSessionTitleOverrides } from './sessionTitleOverrides';

/**
 * [sessionDir] is the working directory the session was recorded under. It is
 * the requested directory for a flat listing and can be a directory below it
 * once nested listings merge several — every row carries it either way, so a
 * caller never has to work out which request produced which row.
 */
export type SessionListEntry = SessionInfo & { sessionId: string; sessionDir: string };

/**
 * One page of sessions, newest first.
 *
 * `total` counts every transcript in scope rather than the page, so a caller
 * can say how much is left without asking for it.
 */
export interface SessionListPage {
  sessions: SessionListEntry[];
  total: number;
  hasMore: boolean;
  /**
   * The `offset` that continues from this page.
   *
   * NOT the same as offset + sessions.length: skipped sessions advance the walk
   * without filling the page, so counting returned rows would ask for a range
   * that overlaps what was already read.
   */
  nextOffset: number;
}

export interface SessionListOptions {
  /** How many entries to skip in the sorted order. */
  offset?: number;
  /** How many sessions to return. Omit to return every one of them. */
  limit?: number;
}

// Cap parallel reads so file descriptors and event-loop slices stay bounded
// even when a project has hundreds of session files.
const READ_CONCURRENCY = 10;

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Enough about one session to place it in the order, without its title.
 *
 * [sessionDir] is the working directory the session belongs to, which is the
 * requested directory for a flat listing and a nested one when directories are
 * merged. It rides along here so a merged order can be built before any
 * transcript is opened.
 */
export interface SessionSortKey {
  sessionId: string;
  fullPath: string;
  sessionsPath: string;
  sessionDir: string;
  /** Milliseconds since the epoch; the sort runs on this. */
  sortedAt: number;
}

/**
 * Order a directory's sessions without opening the transcripts.
 *
 * Ordering needs one value per session and it lives at the END of the file, so
 * a small window there answers it: 259 files take about 47ms this way, against
 * roughly 2.2 seconds to settle every title. Ordering has to cover EVERY
 * session — a page is only the newest N if the newest N were found among all of
 * them — which is exactly why this step has to stay cheap.
 *
 * mtime would be cheaper still and is wrong: the CLI appends entries that are
 * not conversation (file-history snapshots, queue operations), so the file
 * moves when the conversation did not. Measured across 489 transcripts, 335
 * rank differently under mtime, one of them by 205 places.
 */
export async function collectSortKeys(
  workingDir: string,
  sessionDir = workingDir,
): Promise<SessionSortKey[]> {
  const sessionsPath = await getProjectSessionsPath(workingDir);
  console.error('[getSessionsList]', 'looking in:', sessionsPath);

  if (!existsSync(sessionsPath)) {
    console.error('[node-backend]', 'Sessions dir not found:', sessionsPath);
    return [];
  }

  const files = await readdir(sessionsPath);
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  console.error('[node-backend]', 'Found .jsonl files:', jsonlFiles.length);

  return mapWithLimit(jsonlFiles, READ_CONCURRENCY, async (file) => {
    const sessionId = file.replace(/\.jsonl$/, '');
    const fullPath = join(sessionsPath, file);
    const base = { sessionId, fullPath, sessionsPath, sessionDir };
    try {
      const { lastTimestamp } = await scanTail(fullPath);
      if (lastTimestamp) {
        const parsed = Date.parse(lastTimestamp);
        if (!Number.isNaN(parsed)) return { ...base, sortedAt: parsed };
      }
      // No timestamped entry in the window: an empty or barely-started
      // transcript. mtime is a poor ordering signal in general but it is the
      // only one such a file has, and it beats bunching them all at zero.
      const { mtimeMs } = await stat(fullPath);
      return { ...base, sortedAt: mtimeMs };
    } catch {
      return { ...base, sortedAt: 0 };
    }
  });
}

/**
 * Settle titles for one page of an already-ordered list.
 *
 * Walks the order settling one title at a time and stops as soon as the page is
 * full, so a screen of 20 opens 20 transcripts instead of every one in the
 * project. Sessions the webview will not show (sidechains, and transcripts that
 * never held a conversation) do not fill a slot and the walk continues past
 * them — 2.2% of transcripts here, which is why skipping them needs nothing
 * cleverer than reading one more.
 */
export async function resolvePage(
  sortedKeys: SessionSortKey[],
  options: SessionListOptions = {},
): Promise<SessionListPage> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;

  // One override file per directory, read once each rather than per session.
  const overridesByPath = new Map<string, Record<string, string>>();
  const overridesFor = async (sessionsPath: string): Promise<Record<string, string>> => {
    const cached = overridesByPath.get(sessionsPath);
    if (cached) return cached;
    const loaded = await readSessionTitleOverrides(sessionsPath);
    overridesByPath.set(sessionsPath, loaded);
    return loaded;
  };

  const sessions: SessionListEntry[] = [];
  let cursor = offset;

  while (cursor < sortedKeys.length) {
    if (limit !== undefined && sessions.length >= limit) break;

    const remaining = sortedKeys.length - cursor;
    // Read exactly what the page still needs. Reading a fixed block instead
    // would open transcripts the page has no room for, which is the cost this
    // whole function exists to avoid. Skipped sessions leave the page short, so
    // the loop simply comes back for however many are still missing.
    const stillNeeded = limit === undefined ? remaining : limit - sessions.length;
    const batchSize = Math.min(Math.max(stillNeeded, 1), remaining);
    const batch = sortedKeys.slice(cursor, cursor + batchSize);
    cursor += batch.length;

    const infos = await mapWithLimit(batch, READ_CONCURRENCY, async (key) => {
      try {
        const info = await extractSessionInfo(key.fullPath);
        return { key, info };
      } catch (err) {
        console.error('[node-backend]', 'Failed to parse session file:', key.sessionId, err);
        return null;
      }
    });

    for (const resolved of infos) {
      if (resolved === null) continue;
      // A sidechain (and a transcript that never held a conversation, which is
      // reported the same way) is not a row the list shows, so it must not use
      // up a slot — a page of 20 that returned 19 rows would leave the caller
      // unable to tell a short page from the end of the list.
      if (resolved.info.isSidechain) continue;
      if (limit !== undefined && sessions.length >= limit) break;
      const overrides = await overridesFor(resolved.key.sessionsPath);
      const override = overrides[resolved.key.sessionId];
      sessions.push({
        sessionId: resolved.key.sessionId,
        sessionDir: resolved.key.sessionDir,
        ...resolved.info,
        ...(override ? { title: override } : {}),
      });
    }
  }

  return {
    sessions,
    total: sortedKeys.length,
    hasMore: cursor < sortedKeys.length,
    nextOffset: cursor,
  };
}

export async function getSessionsList(
  workingDir: string,
  options: SessionListOptions = {},
): Promise<SessionListPage> {
  console.error('[node-backend]', 'getSessionsList workingDir:', workingDir);

  try {
    const keys = await collectSortKeys(workingDir);
    keys.sort((a, b) => b.sortedAt - a.sortedAt);

    const page = await resolvePage(keys, options);
    console.error(
      '[node-backend]',
      'Returning sessions count:',
      page.sessions.length,
      'of',
      page.total,
    );
    return page;
  } catch (err) {
    console.error('[node-backend]', 'Error reading sessions:', err);
    return { sessions: [], total: 0, hasMore: false, nextOffset: 0 };
  }
}
