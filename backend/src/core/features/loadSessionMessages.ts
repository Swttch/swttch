import { stat } from 'fs/promises';
import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { readJsonlEntries } from './readJsonlEntries';
import { filterActiveChain } from './activeChain';
import { CLI_FLAG_TO_INPUT_MODE } from '../claude-process';

// Raw JSONL entry - passed through as-is to match Kotlin backend
export type SessionMessage = Record<string, unknown>;

export interface PaginatedSessionMessages {
  messages: SessionMessage[];
  hasMore: boolean;
  oldestUuid?: string;
  total: number;
  // The complete active chain (not just the returned page). Kept backend-side for
  // whole-transcript work like workflow reconstruction, which must see tool_use /
  // tool_result entries older than the page. Never forwarded to the webview.
  activeChain: SessionMessage[];
  // The permission mode the CLI was last known to be running under, found within
  // the returned (newest) page only — or null if the page carries none. Only set
  // when this is the newest page (no beforeUuid): an older page says nothing about
  // the session's CURRENT mode. See findLastReportedModeInPage for why the search
  // is bounded to one page rather than the whole session.
  lastReportedMode: string | null;
}

// Extract Task tool_use id -> agentId mappings from main session messages
function extractTaskAgentMappings(messages: SessionMessage[]): Map<string, string> {
  // Map from tool_use id (of Task call) -> agentId
  const toolUseToAgentId = new Map<string, string>();

  // First pass: collect all Task tool_use ids from assistant messages
  const taskToolUseIds = new Set<string>();
  for (const msg of messages) {
    if (msg.type !== 'assistant') continue;
    const message = msg.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        (block as Record<string, unknown>).type === 'tool_use' &&
        ((block as Record<string, unknown>).name === 'Task' || (block as Record<string, unknown>).name === 'Agent')
      ) {
        const id = (block as Record<string, unknown>).id;
        if (typeof id === 'string') {
          taskToolUseIds.add(id);
        }
      }
    }
  }

  // Second pass: find tool_result messages for those Task tool_use ids and extract agentId
  const agentIdRegex = /agentId:\s*([a-f0-9]+)/;
  for (const msg of messages) {
    if (msg.type !== 'user') continue;
    const message = msg.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_result') continue;
      const toolUseId = b.tool_use_id;
      if (typeof toolUseId !== 'string' || !taskToolUseIds.has(toolUseId)) continue;
      // Extract agentId from the content text
      const resultContent = b.content;
      let text = '';
      if (typeof resultContent === 'string') {
        text = resultContent;
      } else if (Array.isArray(resultContent)) {
        for (const item of resultContent) {
          if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text') {
            text += (item as Record<string, unknown>).text ?? '';
          }
        }
      }
      const match = agentIdRegex.exec(text);
      if (match) {
        toolUseToAgentId.set(toolUseId, match[1]);
      }
    }
  }

  return toolUseToAgentId;
}

// Load subagent entries and convert them to synthetic progress entries
async function loadSubagentProgress(
  subagentsDir: string,
  taskToolUseId: string,
  agentId: string,
): Promise<SessionMessage[]> {
  const subagentFile = join(subagentsDir, `agent-${agentId}.jsonl`);
  const subagentEntries = await readJsonlEntries(subagentFile);

  const syntheticEntries: SessionMessage[] = [];
  for (const entry of subagentEntries) {
    const entryType = entry.type;
    if (entryType !== 'assistant' && entryType !== 'user') continue;

    syntheticEntries.push({
      type: 'progress',
      parentToolUseID: taskToolUseId,
      uuid: entry.uuid,
      parentUuid: entry.parentUuid,
      timestamp: entry.timestamp,
      data: {
        type: 'agent_progress',
        agentId,
        message: {
          type: entryType,
          message: entry.message,
          uuid: entry.uuid,
          timestamp: entry.timestamp,
        },
      },
    });
  }

  return syntheticEntries;
}

// Move a page-start index toward older entries until it lands on a uuid-bearing
// message (or index 0). Leading progress/summary entries (which have no uuid)
// belong to this page, not the next older one: keeping them here makes the paging
// cursor — the first entry's uuid — the exact page boundary, so the following
// "load older" page starts right before it with no overlap. Otherwise those
// uuid-less entries get re-sent on the next page and duplicate in the UI, since
// the client can only dedupe by uuid.
function snapStartToUuid(chain: SessionMessage[], start: number): number {
  let i = start;
  while (i > 0 && typeof chain[i].uuid !== 'string') i--;
  return i;
}

// --- Active-chain snapshot cache (issue #8) -------------------------------
//
// Building the paged view is O(entire session): read + parse the whole JSONL,
// read every subagent progress file, then run filterActiveChain over the full
// history. Doing that on *every* "load older" page turns scrolling up through a
// huge session into repeated full-file work just to return a ~50-message slice.
//
// So we cache the fully-parsed + subagent-injected + active-chain-filtered array
// per session file. The cache key is the session file's path; the validity key
// is a cheap `stat` fingerprint (mtimeMs + size of the main file, plus the
// subagents directory mtime so newly-added agent files invalidate too). If the
// fingerprint matches, we serve the page as a pure in-memory slice — identical to
// what the from-disk path would produce, because it *is* the same array. When the
// file changes, the fingerprint differs and we recompute.
//
// Memory is bounded by an LRU-ish Map capped at MAX_CACHED_SESSIONS: a `Map`
// preserves insertion order, so re-inserting on hit marks most-recently-used and
// the oldest key is evicted first once the cap is exceeded.
interface ActiveChainCacheEntry {
  mtimeMs: number;
  size: number;
  // mtimeMs of the subagents dir, or -1 when it does not exist. Adding/removing
  // agent files bumps the dir mtime, so this catches subagent-driven changes even
  // when the main file happens to be unchanged.
  subagentsMtimeMs: number;
  activeChain: SessionMessage[];
}

const MAX_CACHED_SESSIONS = 4;
const activeChainCache = new Map<string, ActiveChainCacheEntry>();

function storeActiveChain(key: string, entry: ActiveChainCacheEntry): void {
  // delete + set moves the key to the end of the Map, marking it most-recently-used.
  activeChainCache.delete(key);
  activeChainCache.set(key, entry);
  // Evict least-recently-used entries (oldest insertion order = first key).
  while (activeChainCache.size > MAX_CACHED_SESSIONS) {
    const oldestKey = activeChainCache.keys().next().value;
    if (oldestKey === undefined) break;
    activeChainCache.delete(oldestKey);
  }
}

// Read the main JSONL, inject subagent progress entries, and apply active-chain
// filtering. This is the expensive path the cache exists to avoid repeating.
async function computeActiveChain(
  sessionFile: string,
  subagentsDir: string,
  hasSubagents: boolean,
): Promise<SessionMessage[]> {
  const allMessages: SessionMessage[] = await readJsonlEntries(sessionFile);

  // Load subagent files and inject synthetic progress entries
  if (hasSubagents) {
    try {
      // Extract Task tool_use id -> agentId mappings from main messages
      const toolUseToAgentId = extractTaskAgentMappings(allMessages);

      if (toolUseToAgentId.size > 0) {
        // Build a map from tool_use id -> index of the assistant message containing that Task tool_use
        const toolUseToAssistantIndex = new Map<string, number>();
        for (let i = 0; i < allMessages.length; i++) {
          const msg = allMessages[i];
          if (msg.type !== 'assistant') continue;
          const message = msg.message as Record<string, unknown> | undefined;
          if (!message) continue;
          const msgContent = message.content;
          if (!Array.isArray(msgContent)) continue;
          for (const block of msgContent) {
            if (
              block &&
              typeof block === 'object' &&
              (block as Record<string, unknown>).type === 'tool_use' &&
              ((block as Record<string, unknown>).name === 'Task' || (block as Record<string, unknown>).name === 'Agent')
            ) {
              const id = (block as Record<string, unknown>).id;
              if (typeof id === 'string' && toolUseToAgentId.has(id)) {
                toolUseToAssistantIndex.set(id, i);
              }
            }
          }
        }

        // Load all subagent progress entries, keyed by insertion index
        // We collect (insertAfterIndex, syntheticEntries) pairs, then splice in reverse order
        const insertions: Array<{ afterIndex: number; entries: SessionMessage[] }> = [];

        for (const [toolUseId, agentId] of toolUseToAgentId.entries()) {
          const assistantIndex = toolUseToAssistantIndex.get(toolUseId);
          if (assistantIndex === undefined) continue;

          try {
            const syntheticEntries = await loadSubagentProgress(subagentsDir, toolUseId, agentId);
            if (syntheticEntries.length > 0) {
              insertions.push({ afterIndex: assistantIndex, entries: syntheticEntries });
            }
          } catch {
            // Subagent file missing or unreadable — skip gracefully
          }
        }

        // Insert in reverse order of index so earlier insertions don't shift later indices
        insertions.sort((a, b) => b.afterIndex - a.afterIndex);
        for (const { afterIndex, entries } of insertions) {
          allMessages.splice(afterIndex + 1, 0, ...entries);
        }
      }
    } catch {
      // Any unexpected error in subagent loading
    }
  }

  // Apply active chain filtering on the complete history
  return filterActiveChain(allMessages);
}

// Return the active-chain snapshot for a session, from cache when the on-disk
// fingerprint is unchanged, otherwise recomputed and re-cached.
async function getActiveChain(
  sessionFile: string,
  sessionsPath: string,
  targetSessionId: string,
): Promise<SessionMessage[]> {
  // stat the main file first: this both provides the cache fingerprint and throws
  // (ENOENT) for a missing session, preserving the "return empty on read error"
  // behavior via the caller's catch.
  const mainStat = await stat(sessionFile);

  // Fingerprint the subagents dir too (mtime changes when agent files are added).
  const subagentsDir = join(sessionsPath, targetSessionId, 'subagents');
  let subagentsMtimeMs = -1;
  let hasSubagents = false;
  try {
    subagentsMtimeMs = (await stat(subagentsDir)).mtimeMs;
    hasSubagents = true;
  } catch {
    // No subagents directory
  }

  const cached = activeChainCache.get(sessionFile);
  if (
    cached &&
    cached.mtimeMs === mainStat.mtimeMs &&
    cached.size === mainStat.size &&
    cached.subagentsMtimeMs === subagentsMtimeMs
  ) {
    // Cache hit: refresh LRU position and reuse the snapshot without touching disk.
    storeActiveChain(sessionFile, cached);
    return cached.activeChain;
  }

  // Cache miss or stale fingerprint: recompute from disk and cache the result.
  const activeChain = await computeActiveChain(sessionFile, subagentsDir, hasSubagents);
  storeActiveChain(sessionFile, {
    mtimeMs: mainStat.mtimeMs,
    size: mainStat.size,
    subagentsMtimeMs,
    activeChain,
  });
  return activeChain;
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

export async function loadSessionMessages(
  workingDir: string,
  targetSessionId: string,
  beforeUuid?: string,
  limit?: number,
): Promise<PaginatedSessionMessages> {
  let activeChainMessages: SessionMessage[];
  try {
    const sessionsPath = await getProjectSessionsPath(workingDir);
    const sessionFile = join(sessionsPath, `${targetSessionId}.jsonl`);
    activeChainMessages = await getActiveChain(sessionFile, sessionsPath, targetSessionId);
  } catch (err) {
    console.error('[node-backend]', 'Error loading session:', err);
    return {
      messages: [],
      hasMore: false,
      total: 0,
      activeChain: [],
      lastReportedMode: null,
    };
  }

  const total = activeChainMessages.length;
  const pageSize = limit ?? 50;

  let slicedMessages: SessionMessage[] = [];
  let hasMore = false;

  // Compute the latest (newest) page — shared by the no-cursor case and the
  // cursor-miss fallback below.
  const latestPageStart = snapStartToUuid(activeChainMessages, Math.max(0, total - pageSize));

  if (beforeUuid) {
    // Find the index of the message with beforeUuid
    const index = activeChainMessages.findIndex(m => m.uuid === beforeUuid);
    if (index !== -1) {
      // Return older messages (indices before index)
      const startIndex = snapStartToUuid(activeChainMessages, Math.max(0, index - pageSize));
      slicedMessages = activeChainMessages.slice(startIndex, index);
      hasMore = startIndex > 0;
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
      slicedMessages = activeChainMessages.slice(latestPageStart);
      hasMore = latestPageStart > 0;
    }
  } else {
    // Return latest page
    slicedMessages = activeChainMessages.slice(latestPageStart);
    hasMore = latestPageStart > 0;
  }

  // The paging cursor must be a real message uuid. The first sliced entry can be a
  // progress/summary record without a uuid — using it would yield `undefined`, which
  // stalls "load older" (the client guards on a falsy cursor). Pick the oldest entry
  // that actually has a uuid.
  const oldestUuid = slicedMessages.find(
    (m) => typeof m.uuid === 'string',
  )?.uuid as string | undefined;

  // Only the newest page (no cursor) describes the session's CURRENT mode — an
  // older "load older" page is history, not "what mode is this session in now".
  const lastReportedMode = beforeUuid ? null : findLastReportedModeInPage(slicedMessages);

  return {
    messages: slicedMessages,
    hasMore,
    oldestUuid,
    total,
    activeChain: activeChainMessages,
    lastReportedMode,
  };
}
