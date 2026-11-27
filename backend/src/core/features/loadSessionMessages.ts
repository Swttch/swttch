import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import {
  getSessionIndex,
  readIndexedEntries,
  readWholeChain,
  type IndexedEntry,
  type SessionMessage,
} from './sessionIndex';
import { CLI_FLAG_TO_INPUT_MODE } from '../claude-process';
import { PAGE_RECORDS_PER_ENTRY, QUEUED_KEY_PREFIX, restoreQueuedEntries } from '../../shared';

// Raw JSONL entry - passed through as-is to match Kotlin backend
export type { SessionMessage };

export interface PaginatedSessionMessages {
  messages: SessionMessage[];
  hasMore: boolean;
  oldestUuid?: string;
  /**
   * The uuid of the newest entry on the page that has one, which is the cursor
   * the page after this one is asked for with (`afterUuid`). An entry without a
   * uuid is never a cursor, for the same reason `oldestUuid` skips them.
   */
  newestUuid?: string;
  /** The active chain holds entries after the last one on this page. */
  hasNewer: boolean;
  /**
   * The request named an entry to stop at (`untilUuid`) and the page runs right up to it: for a
   * page after a cursor, it ends exactly in front of that entry; for a page before a cursor, it
   * begins exactly after it. The client joins what it holds on both sides when this is true,
   * which it cannot tell from the uuids alone when the page holds none of the entry's neighbours.
   */
  reached: boolean;
  /**
   * The cursor the request named is not in the active chain, so the page served
   * is the newest one instead, and the client has to start over from it rather
   * than join it to what it holds. See the cursor-miss branches below.
   */
  reset: boolean;
  total: number;
  // What workflow reconstruction reads of the whole active chain: the calls of the background tasks, the
  // results that answer them and the task notifications, entries older than the page included. The
  // reconstruction must see tool_use / tool_result entries older than the page, and the chain they come
  // from is no longer held (see sessionIndex), so this is the part of it that is. Never forwarded to the
  // webview.
  workflowChain: SessionMessage[];
  // The permission mode the CLI was last known to be running under, found within
  // the returned (newest) page only — or null if the page carries none. Only set
  // when this is the newest page (no beforeUuid): an older page says nothing about
  // the session's CURRENT mode. See findLastReportedModeInPage for why the search
  // is bounded to one page rather than the whole session.
  lastReportedMode: string | null;
  /**
   * The session's transcript is KNOWN to be absent from disk.
   *
   * True only for ENOENT. Every other read failure (a permission error, an I/O
   * error, a directory that could not be resolved) leaves this false, because
   * those say "the transcript could not be read", not "the transcript is not
   * there" — and the webview redirects away from a session on this flag alone.
   * Treating an unreadable file as a missing one would throw the user out of a
   * session that exists.
   *
   * An empty `messages` array cannot answer the same question: a transcript that
   * holds no active-chain entry produces one too.
   */
  sessionMissing: boolean;
}

// Move a page-start index toward older entries until it lands on a uuid-bearing
// message (or index 0). Leading progress/summary entries (which have no uuid)
// belong to this page, not the next older one: keeping them here makes the paging
// cursor — the first entry's uuid — the exact page boundary, so the following
// "load older" page starts right before it with no overlap. Otherwise those
// uuid-less entries get re-sent on the next page and duplicate in the UI, since
// the client can only dedupe by uuid.
function snapStartToUuid(chain: ReadonlyArray<{ uuid?: unknown }>, start: number): number {
  let i = start;
  while (i > 0 && typeof chain[i].uuid !== 'string') i--;
  return i;
}

// Where the page that ends before `end` begins: `size` entries of the conversation back, with every record between
// them, or fewer where the limit of records is reached first (see PAGE_RECORDS_PER_ENTRY).
function pageStartBefore(chain: ReadonlyArray<IndexedEntry>, end: number, size: number): number {
  const limit = size * PAGE_RECORDS_PER_ENTRY;
  let start = end;
  for (let counted = 0; start > 0 && counted < size && end - start < limit; start--) {
    if (chain[start - 1].counted) counted++;
  }
  return start;
}

// Where the page that begins at `start` ends (exclusive), counted the same way toward the newest.
function pageEndAfter(chain: ReadonlyArray<IndexedEntry>, start: number, size: number): number {
  const limit = size * PAGE_RECORDS_PER_ENTRY;
  let end = start;
  for (let counted = 0; end < chain.length && counted < size && end - start < limit; end++) {
    if (chain[end].counted) counted++;
  }
  return end;
}

// The index of the first uuid-bearing entry after `index`, or the chain's length
// when there is none. A page after a cursor starts here: the entries without a
// uuid right after the cursor entry are part of its group, which the page the
// cursor ended already carried.
function nextUuidIndexAfter(chain: ReadonlyArray<{ uuid?: unknown }>, index: number): number {
  let i = index + 1;
  while (i < chain.length && typeof chain[i].uuid !== 'string') i++;
  return i;
}

/**
 * How long the whole chain, once read back, is kept for the next caller.
 *
 * The callers that want all of it (a search, the list of a session's assets) tend to come in bursts, and a
 * burst should read the file once. But nothing in the paging path needs the whole chain, and keeping it
 * is what made a long session cost the backend a gigabyte for as long as it stayed open (#680), so it is
 * let go of after a moment instead of being held with the session.
 */
const WHOLE_CHAIN_KEEP_MS = 15_000;
let wholeChain: { key: string; chain: SessionMessage[]; timer: ReturnType<typeof setTimeout> } | null = null;

/**
 * A session's complete active chain, read back from the file.
 *
 * For the callers that need every entry: a search, the list of what a session produced, its assets. The
 * prompt history and the send index do not come through here; they read `promptChain` off the index, which
 * is built in the same pass as the index and holds only what they read (see `loadPromptChain`).
 *
 * Returns an empty array when the session file cannot be read, matching what `loadSessionMessages` reports
 * for the same failure.
 */
export async function loadActiveChain(
  workingDir: string,
  targetSessionId: string,
): Promise<SessionMessage[]> {
  try {
    const sessionsPath = await getProjectSessionsPath(workingDir);
    const sessionFile = join(sessionsPath, `${targetSessionId}.jsonl`);
    const index = await getSessionIndex(sessionFile, sessionsPath, targetSessionId);
    // The key names the index itself, so a changed file (a new index) is read again.
    const key = `${sessionFile}#${index.entries.length}#${index.entries[index.entries.length - 1]?.offset ?? 0}`;
    if (wholeChain && wholeChain.key === key) return wholeChain.chain;
    const chain = await readWholeChain(index);
    if (wholeChain) clearTimeout(wholeChain.timer);
    const timer = setTimeout(() => {
      wholeChain = null;
    }, WHOLE_CHAIN_KEEP_MS);
    timer.unref?.();
    wholeChain = { key, chain, timer };
    return chain;
  } catch (err) {
    console.error('[node-backend]', 'Error loading active chain:', err);
    return [];
  }
}

/**
 * The user entries and queue records of a session's active chain, which is everything the prompt history
 * and the send index read of it. Tool results, which are most of a long transcript, are reduced to what
 * says they are tool results, so this is small however long the session is.
 */
export async function loadPromptChain(
  workingDir: string,
  targetSessionId: string,
): Promise<SessionMessage[]> {
  try {
    const sessionsPath = await getProjectSessionsPath(workingDir);
    const sessionFile = join(sessionsPath, `${targetSessionId}.jsonl`);
    return (await getSessionIndex(sessionFile, sessionsPath, targetSessionId)).promptChain;
  } catch (err) {
    console.error('[node-backend]', 'Error loading prompt chain:', err);
    return [];
  }
}

/**
 * The permission mode the CLI was last running under, read from the newest page
 * of messages only — never by scanning further back into the session.
 *
 * Every `user` entry the CLI actually processed as a prompt carries the mode it
 * was applied under (`permissionMode`, in the CLI's own flag vocabulary — see
 * CLI_FLAG_TO_INPUT_MODE). A `user`-typed entry WITHOUT that field is a tool
 * result being fed back to the CLI, not a prompt — it never had a mode and is
 * skipped, not treated as "unknown" (see cli-tool-results-are-user-type-entries).
 * The most recent entry that does carry the field is the session's current mode
 * as of reload.
 *
 * Bounded to one page on purpose: walking further back to find a mode would mean
 * reading and parsing session history the reload does not otherwise need, and
 * that cost grows with session age with no upper bound. If nothing in the newest
 * page carries the field at all, that is treated as "too far back to look" and
 * the caller falls back to the configured default rather than paying for a
 * deeper scan.
 *
 * The most recent entry that DOES carry the field decides the answer outright —
 * if its flag is unrecognized, this returns null rather than falling through to
 * an OLDER, recognized flag. Skipping past it would risk reporting a mode the
 * session has since moved away from as if it were current; "unknown" must not
 * silently resolve to a stale guess.
 */
export function findLastReportedModeInPage(page: SessionMessage[]): string | null {
  for (let i = page.length - 1; i >= 0; i--) {
    const entry = page[i];
    if (entry.type !== 'user') continue;
    const flag = entry.permissionMode;
    if (flag === undefined) continue; // tool-result entry, not a prompt — no mode to read
    if (typeof flag !== 'string') return null;
    return CLI_FLAG_TO_INPUT_MODE[flag] ?? null;
  }
  return null;
}

/**
 * Where in the chain a message rebuilt from the queue records stands: at the `remove` that consumed it, which is where
 * the chat draws it. Such a message has no entry of its own, so a jump to it names it and is answered here.
 */
function indexOfQueued(
  chain: IndexedEntry[],
  key: string,
  prompts: SessionMessage[],
  queueRecords: Map<SessionMessage, IndexedEntry>,
): number {
  const sources = restoreQueuedEntries(prompts).find(({ entry }) => entry.uuid === key)?.sources;
  const remove = sources?.[sources.length - 1];
  const indexed = remove ? queueRecords.get(remove) : undefined;
  return indexed ? chain.indexOf(indexed) : -1;
}

export async function loadSessionMessages(
  workingDir: string,
  targetSessionId: string,
  beforeUuid?: string,
  limit?: number,
  afterUuid?: string,
  aroundUuid?: string,
  untilUuid?: string,
): Promise<PaginatedSessionMessages> {
  /*
    The chain is held as an index: one small record per entry, saying where its line is in the file (see
    sessionIndex). A page is cut out of the index, and only the entries on it are read and parsed.
  */
  let chain: IndexedEntry[];
  let workflowChain: SessionMessage[];
  let prompts: SessionMessage[];
  let queueRecords: Map<SessionMessage, IndexedEntry>;
  let inPlanMode = false;
  try {
    const sessionsPath = await getProjectSessionsPath(workingDir);
    const sessionFile = join(sessionsPath, `${targetSessionId}.jsonl`);
    const index = await getSessionIndex(sessionFile, sessionsPath, targetSessionId);
    chain = index.entries;
    prompts = index.promptChain;
    queueRecords = index.queueRecords;
    workflowChain = index.workflowChain;
    inPlanMode = index.inPlanMode;
  } catch (err) {
    console.error('[node-backend]', 'Error loading session:', err);
    return {
      messages: [],
      hasMore: false,
      hasNewer: false,
      reached: false,
      reset: false,
      total: 0,
      workflowChain: [],
      lastReportedMode: null,
      sessionMissing: (err as NodeJS.ErrnoException)?.code === 'ENOENT',
    };
  }

  const total = chain.length;
  const pageSize = limit ?? 50;

  // The slice of the chain this page is, as indexed entries; read from the file below.
  let sliced: IndexedEntry[] = [];
  let hasMore = false;
  let hasNewer = false;
  let reached = false;
  let reset = false;

  // Compute the latest (newest) page — shared by the no-cursor case and the
  // cursor-miss fallback below.
  const latestPageStart = snapStartToUuid(chain, pageStartBefore(chain, total, pageSize));

  if (afterUuid) {
    /*
      The page after a cursor. A page starts at an entry that has a uuid, and the
      entries without one that follow an entry belong to it, so the cursor's own
      group is skipped whole and the page starts at the next uuid entry.
    */
    const index = chain.findIndex(m => m.uuid === afterUuid);
    if (index === -1) {
      // The cursor is not in the active chain (a rewind or an edit rebuilt it).
      // Serving the newest page and saying so lets the client start over, rather
      // than stranding it with a cursor that no page can follow.
      console.warn(
        '[node-backend]',
        `loadSessionMessages: cursor uuid not found in active chain (afterUuid=${afterUuid}); ` +
          'returning latest page so the client can start over',
      );
      sliced = chain.slice(latestPageStart);
      hasMore = latestPageStart > 0;
      reset = true;
    } else {
      const start = nextUuidIndexAfter(chain, index);
      // Where the client already holds what follows: the page stops in front of it.
      const stopIndex = untilUuid ? chain.findIndex(m => m.uuid === untilUuid) : -1;
      const stop = stopIndex > index ? stopIndex : -1;
      if (start < total) {
        const rawEnd = pageEndAfter(chain, start, pageSize);
        let end = rawEnd >= total ? total : snapStartToUuid(chain, rawEnd);
        // A group longer than a page still has to make progress.
        if (end <= start) end = nextUuidIndexAfter(chain, start);
        if (stop !== -1 && end >= stop) {
          end = Math.max(start, stop);
          reached = true;
        }
        sliced = chain.slice(start, end);
        hasNewer = end < total;
      }
      hasMore = start > 0;
    }
  } else if (aroundUuid) {
    /*
      The page that holds an entry the client does not hold, centred on it: where
      the find bar or the send index is taking the reader. The client keeps the
      newest pages it already has and puts this page where the recycler was, so
      nothing between the two has to be sent. An unknown uuid is a cursor miss.
    */
    const index = aroundUuid.startsWith(QUEUED_KEY_PREFIX)
      ? indexOfQueued(chain, aroundUuid, prompts, queueRecords)
      : chain.findIndex(m => m.uuid === aroundUuid);
    if (index === -1) {
      console.warn(
        '[node-backend]',
        `loadSessionMessages: entry not found in active chain (aroundUuid=${aroundUuid}); ` +
          'returning latest page so the client can start over',
      );
      sliced = chain.slice(latestPageStart);
      hasMore = latestPageStart > 0;
      reset = true;
    } else {
      const start = snapStartToUuid(chain, pageStartBefore(chain, index, Math.floor(pageSize / 2)));
      const rawEnd = Math.max(pageEndAfter(chain, start, pageSize), index + 1);
      let end = rawEnd >= total ? total : snapStartToUuid(chain, rawEnd);
      // Walking back to a uuid entry must not cut the target itself off.
      if (end <= index) end = nextUuidIndexAfter(chain, index);
      sliced = chain.slice(start, end);
      hasMore = start > 0;
      hasNewer = end < total;
    }
  } else if (beforeUuid) {
    // Find the index of the message with beforeUuid
    const index = chain.findIndex(m => m.uuid === beforeUuid);
    if (index !== -1) {
      // Return older messages (indices before index).
      let startIndex = snapStartToUuid(chain, pageStartBefore(chain, index, pageSize));
      // Where the client already holds what comes before: the page begins right after it. The entries
      // without a uuid that follow that entry are its own, which the client holds.
      const stopIndex = untilUuid ? chain.findIndex(m => m.uuid === untilUuid) : -1;
      if (stopIndex !== -1 && stopIndex < index) {
        const floor = nextUuidIndexAfter(chain, stopIndex);
        if (startIndex <= floor) {
          startIndex = Math.min(floor, index);
          reached = true;
        }
      }
      sliced = chain.slice(startIndex, index);
      hasMore = startIndex > 0;
      hasNewer = true;
    } else {
      // Issue #6: the cursor uuid is not in the active chain. This can happen if
      // the chain was recomputed and the client's cursor now points at a filtered
      // or non-existent entry. Returning an empty page with hasMore=false would
      // permanently strand ALL older history. Instead, log and fall back to the
      // latest page: its oldestUuid is a real chain uuid, so the client's next
      // "load older" locates the cursor and paging self-heals. The client dedupes
      // by uuid, so any overlap with what it already has is harmless.
      console.warn(
        '[node-backend]',
        `loadSessionMessages: cursor uuid not found in active chain (beforeUuid=${beforeUuid}); ` +
          'returning latest page to avoid stranding history',
      );
      sliced = chain.slice(latestPageStart);
      hasMore = latestPageStart > 0;
      reset = true;
    }
  } else {
    // Return latest page
    sliced = chain.slice(latestPageStart);
    hasMore = latestPageStart > 0;
  }

  // Only now is anything read from the file: the entries of this one page.
  const slicedMessages = await readIndexedEntries(sliced);

  // The paging cursor must be a real message uuid. The first sliced entry can be a
  // progress/summary record without a uuid — using it would yield `undefined`, which
  // stalls "load older" (the client guards on a falsy cursor). Pick the oldest entry
  // that actually has a uuid.
  const oldestUuid = slicedMessages.find(
    (m) => typeof m.uuid === 'string',
  )?.uuid as string | undefined;

  // The cursor for the page after this one. Found from the end, like `oldestUuid`
  // is from the start, because the last entry of a page can be one without a uuid.
  let newestUuid: string | undefined;
  for (let i = slicedMessages.length - 1; i >= 0; i--) {
    const uuid = slicedMessages[i].uuid;
    if (typeof uuid === 'string') {
      newestUuid = uuid;
      break;
    }
  }

  // Only the newest page (no cursor) describes the session's CURRENT mode — an
  // older "load older" page is history, not "what mode is this session in now".
  // A page served for a cursor miss IS the newest page, whatever was asked for.
  const lastReportedMode =
    (beforeUuid || afterUuid || aroundUuid) && !reset ? null : (inPlanMode ? 'plan' : findLastReportedModeInPage(slicedMessages));

  return {
    messages: slicedMessages,
    hasMore,
    hasNewer,
    reached,
    reset,
    oldestUuid,
    newestUuid,
    total,
    workflowChain,
    lastReportedMode,
    sessionMissing: false,
  };
}
