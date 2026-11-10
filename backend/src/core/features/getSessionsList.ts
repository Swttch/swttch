import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { extractSessionInfo, scanTail, type SessionInfo } from './extractSessionInfo';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { readSessionTitleOverrides } from './sessionTitleOverrides';
import { includeLastPromptInTitles } from './sessionTitleSettings';
import { readSessionMarksToShow, type SessionMark } from './sessionMarks';
import { orderByFamily } from './sessionFamilyOrder';

/**
 * [sessionDir] is the working directory the session was recorded under. It is
 * the requested directory for a flat listing and can be a directory below it
 * once nested listings merge several — every row carries it either way, so a
 * caller never has to work out which request produced which row.
 *
 * [sessionMark] is the row the session-management MCP keeps about the session
 * (which session started it, among other things), whole, when there is one and
 * that package is installed. The list draws a session under the one that started
 * it from this.
 */
export type SessionListEntry = SessionInfo & {
  sessionId: string;
  sessionDir: string;
  sessionMark?: SessionMark;
};

/**
 * One page of sessions, newest first.
 *
 * A page holds whole families: a top-level session and everything under it (the
 * sessions it started through the session-management MCP, and the ones those
 * started). A family is never cut by the end of a page.
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
   * that overlaps what was already read. It is a position in the listing's own
   * order (family after family), to be handed back as it came.
   */
  nextOffset: number;
  /**
   * How many working directories the list was drawn from. One for a flat
   * listing; more once nested directories are merged.
   *
   * A property of the SCOPE, not of the page. A caller cannot work it out from
   * the rows it holds: the newest sessions can all belong to the same directory
   * while further pages hold others, so a page of rows that happen to share a
   * directory says nothing about whether directories were merged. Only the side
   * that walked the directories knows, so it states it.
   */
  scopeDirCount: number;
}

export interface SessionListOptions {
  /** Where to start: 0, or the `nextOffset` of the page before. */
  offset?: number;
  /**
   * How many top-level sessions to return. Each comes with everything under it,
   * however many that is, so a page can hold more rows than this. Omit to return
   * every session.
   */
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
 *
 * The page is counted in top-level sessions, and each brings its whole family
 * (see `orderByFamily`). [sortedKeys] is the plain newest-first order; the
 * family order is worked out here, from the marks, so every caller pages the
 * same way.
 */
export async function resolvePage(
  sortedKeys: SessionSortKey[],
  options: SessionListOptions = {},
): Promise<SessionListPage> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;

  // One override file per directory, read once each rather than per session.
  // The promise is kept, not the value: the sessions of a batch ask at the same time.
  const overridesByPath = new Map<string, Promise<Record<string, string>>>();
  const overridesFor = (sessionsPath: string): Promise<Record<string, string>> => {
    let loading = overridesByPath.get(sessionsPath);
    if (!loading) {
      loading = readSessionTitleOverrides(sessionsPath);
      overridesByPath.set(sessionsPath, loading);
    }
    return loading;
  };

  // The switch is per project, so it is read once per directory the page draws from.
  const lastPromptByDir = new Map<string, boolean>();
  const includeLastPromptFor = async (sessionDir: string): Promise<boolean> => {
    const cached = lastPromptByDir.get(sessionDir);
    if (cached !== undefined) return cached;
    const loaded = await includeLastPromptInTitles(sessionDir);
    lastPromptByDir.set(sessionDir, loaded);
    return loaded;
  };

  // Read once for the page. The file is small and another program appends to it
  // at any time, so it is not cached between requests. Empty while the package
  // that keeps the marks is not installed.
  const marks = await readSessionMarksToShow();

  const order = orderByFamily(sortedKeys, marks);
  const keys = order.keys;

  const sessions: SessionListEntry[] = [];
  // Families that put at least one row on the page: the unit the page is counted in.
  let families = 0;
  let cursor = Math.min(offset, keys.length);

  while (cursor < keys.length) {
    if (limit !== undefined && families >= limit) break;

    // Read exactly what the page still needs: the next families, as many as are
    // still missing. Reading a fixed block instead would open transcripts the
    // page has no room for, which is the cost this whole function exists to
    // avoid. A family none of whose sessions is shown leaves the page short, so
    // the loop simply comes back for however many are still missing.
    const stillNeeded = limit === undefined ? Number.POSITIVE_INFINITY : limit - families;
    const batchStart = cursor;
    let batchEnd = cursor;
    for (let taken = 0; batchEnd < keys.length && taken < stillNeeded; taken++) {
      batchEnd = order.familyEnd(batchEnd);
    }
    const batch = keys.slice(batchStart, batchEnd);
    cursor = batchEnd;

    const infos = await mapWithLimit(batch, READ_CONCURRENCY, async (key) => {
      try {
        const overrides = await overridesFor(key.sessionsPath);
        const info = await extractSessionInfo(key.fullPath, {
          includeLastPrompt: await includeLastPromptFor(key.sessionDir),
          override: overrides[key.sessionId],
        });
        return { key, info };
      } catch (err) {
        console.error('[node-backend]', 'Failed to parse session file:', key.sessionId, err);
        return null;
      }
    });

    for (let familyStart = batchStart; familyStart < batchEnd; ) {
      const familyEnd = order.familyEnd(familyStart);
      let shown = 0;
      for (let index = familyStart; index < familyEnd; index++) {
        const resolved = infos[index - batchStart];
        if (resolved === null) continue;
        // A sidechain (and a transcript that never held a conversation, which
        // is reported the same way) is not a row the list shows.
        if (resolved.info.isSidechain) continue;
        const sessionMark = marks.get(resolved.key.sessionId);
        sessions.push({
          sessionId: resolved.key.sessionId,
          sessionDir: resolved.key.sessionDir,
          ...resolved.info,
          ...(sessionMark ? { sessionMark } : {}),
        });
        shown++;
      }
      // A family with nothing to show must not use up a slot — a page of 20
      // that returned 19 would leave the caller unable to tell a short page
      // from the end of the list.
      if (shown > 0) families++;
      familyStart = familyEnd;
    }
  }

  // Counted over EVERY key in scope rather than the page's rows, which is the
  // whole point: a first page can be entirely one directory while the scope
  // spans several, and that page still has to be labelled as merged.
  //
  // Directories that hold no session do not count. The question a caller asks
  // this is "do these rows come from more than one place", and a directory that
  // contributed nothing cannot make two rows ambiguous.
  const scopeDirCount = new Set(sortedKeys.map((k) => k.sessionDir)).size;

  return {
    sessions,
    total: sortedKeys.length,
    hasMore: cursor < keys.length,
    nextOffset: cursor,
    scopeDirCount,
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
    return { sessions: [], total: 0, hasMore: false, nextOffset: 0, scopeDirCount: 0 };
  }
}
