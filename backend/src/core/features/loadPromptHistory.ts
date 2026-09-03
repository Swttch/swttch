import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import { isQueueOperation, queuedMidTurnCounts } from '../../shared';

/**
 * How many prompts one page of history carries.
 *
 * Small on purpose. The composer needs the newest few the moment the user presses
 * Up, and pages further back only if they keep walking. Sending the whole list up
 * front is what we are avoiding: measured over 197 sessions of this repo, the
 * newest 100 prompts serialise to 8KB at the median but 21MB at the worst, because
 * a prompt carries whatever was pasted into it (base64 images, long text).
 */
export const PROMPT_HISTORY_PAGE_SIZE = 20;

/**
 * How many bytes of entries one page may carry.
 *
 * A count alone does not bound a page, because one prompt can be arbitrarily
 * large on its own: a prompt with a pasted screenshot carries the image as base64,
 * and the worst session measured here serialises 100 prompts to 21MB. Stripping
 * the image blocks out of the entry is not an option — that is the entry editing
 * the original-data principle forbids — so the page is bounded by size instead,
 * which is the range split the same principle allows.
 *
 * A page always yields at least one entry, so an oversized prompt is still
 * reachable; it just arrives on a page of its own.
 */
export const PROMPT_HISTORY_PAGE_BYTES = 256 * 1024;

export interface PromptHistoryPage {
  /**
   * The matching entries, in transcript order (oldest first) exactly as they sit
   * in the session file — no field is renamed, dropped or rewritten. Turning an
   * entry into composer text is the webview's job.
   */
  entries: SessionMessage[];
  /** More prompts exist before this page. */
  hasMore: boolean;
  /** Cursor for the next page: the uuid of this page's oldest entry. */
  oldestUuid?: string;
}

/**
 * CLI-authored text that occupies a `user` entry without a human having typed it.
 *
 * Content is the only signal for these. Measured across every project on this
 * machine, no field distinguishes them from a real prompt — not even
 * `permissionMode`, which the CLI stamps on anything it *processes* as a prompt
 * including the ones it writes itself: 153 `<task-notification>`, 25
 * `<ide_opened_file>` and 11 `<system-reminder>` entries all carried it.
 *
 * Anchored at the start, and listed by name rather than matching any tag, so a
 * prompt that merely opens with markup the user typed still counts as typed.
 */
const CLI_AUTHORED_TEXT = new RegExp(
  '^\\s*(?:'
  + '<command-name>|<command-message>|<local-command-stdout>'
  + '|<task-notification>|<ide_opened_file>|<system-reminder>'
  + '|\\[Request interrupted by user'
  + ')',
);

/** The text a `user` entry carries, ignoring non-text blocks. */
function textOf(entry: SessionMessage): string {
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .filter(b => b.type === 'text')
    .map(b => (typeof b.text === 'string' ? b.text : ''))
    .join('\n');
}

function hasToolResultBlock(entry: SessionMessage): boolean {
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(b => !!b && typeof b === 'object' && (b as Record<string, unknown>).type === 'tool_result');
}

/**
 * Whether a chain entry is a prompt the user actually typed.
 *
 * Most `user` entries are not: in one 9,326-line session, 1,281 of 1,345 `user`
 * entries were tool_result plumbing and only ~46 were typed. So the test is a
 * series of nets, each justified by what was measured in real transcripts:
 *
 * 1. Structural flags the CLI does set — isMeta (skill preambles, image dimension
 *    notes), isCompactSummary (the continuation blob), isSidechain (subagent
 *    turns), isSynthetic / sourceToolUseID (skill-expanded prompts).
 * 2. tool_result blocks, and entries whose text is empty once non-text blocks are
 *    ignored.
 * 3. `permissionMode`, which the CLI stamps on every entry it *processed* as a
 *    prompt. That is a weaker claim than "a human typed this" — the CLI stamps
 *    its own injected prompts too — but it is exact in the other direction: not
 *    one of the 29,721 tool results, meta entries or interrupt markers carried
 *    it. So it is used to reject, never on its own to accept, and only for
 *    chains that stamp it at all, so a session written by a CLI old enough not
 *    to set the field degrades to the other nets rather than reporting an empty
 *    history.
 * 4. CLI_AUTHORED_TEXT, which catches what is left: the entries the CLI wrote
 *    into the conversation itself, which no field sets apart.
 */
export function isTypedPrompt(entry: SessionMessage, chainStampsPermissionMode: boolean): boolean {
  if (entry.type !== 'user') return false;
  if (entry.isMeta || entry.isCompactSummary || entry.isSidechain || entry.isSynthetic) return false;
  if (entry.sourceToolUseID) return false;
  if (hasToolResultBlock(entry)) return false;

  const text = textOf(entry);
  if (!text.trim()) return false;
  if (CLI_AUTHORED_TEXT.test(text)) return false;

  if (chainStampsPermissionMode && entry.permissionMode === undefined) return false;

  return true;
}

/** Whether any `user` entry in the chain carries `permissionMode`. */
export function chainStampsPermissionMode(chain: SessionMessage[]): boolean {
  return chain.some(entry => entry.type === 'user' && entry.permissionMode !== undefined);
}

/**
 * The prompts of a chain, in transcript order, including the ones that exist only
 * as queue bookkeeping.
 *
 * A message typed while a turn is running never becomes a `user` entry at all —
 * the CLI records an `enqueue` and a `remove` and nothing else — so a filter that
 * only looks at `user` entries silently loses it. The chat transcript already
 * rebuilds those (restoreQueuedMessages); this is the same recovery for the
 * history, off the same shared pairing rule, so a message cannot show up in the
 * transcript and be missing from the history.
 *
 * The queue entry is taken at its `enqueue`, which is when the user typed it.
 * (The transcript instead renders it at the `remove`, where the CLI consumed it,
 * because that is where the bubble belongs in the reply flow. Both orderings agree
 * on the order of the prompts themselves, which is all the history walks.)
 */
export function collectPrompts(chain: SessionMessage[]): SessionMessage[] {
  const stamped = chainStampsPermissionMode(chain);
  const queuedMidTurn = queuedMidTurnCounts(chain);
  const takenSoFar = new Map<string, number>();

  const prompts: SessionMessage[] = [];
  for (const entry of chain) {
    if (isQueueOperation(entry)) {
      if (entry.operation !== 'enqueue' || typeof entry.content !== 'string') continue;
      const taken = (takenSoFar.get(entry.content) ?? 0) + 1;
      takenSoFar.set(entry.content, taken);
      if (taken <= (queuedMidTurn.get(entry.content) ?? 0)) prompts.push(entry);
      continue;
    }
    if (isTypedPrompt(entry, stamped)) prompts.push(entry);
  }
  return prompts;
}

/**
 * One page of the prompts typed in a session, newest page first.
 *
 * Mirrors the transcript paging contract on purpose (`beforeUuid` cursor,
 * `hasMore`, `oldestUuid`) so both paths read the same way and neither can drift
 * into its own idea of what a page means.
 */
export async function loadPromptHistory(
  workingDir: string,
  targetSessionId: string,
  beforeUuid?: string,
  limit?: number,
): Promise<PromptHistoryPage> {
  const chain = await loadActiveChain(workingDir, targetSessionId);
  const prompts = collectPrompts(chain);

  // A cursor that is not in the list means the chain was rebuilt under the client
  // (an edit or rewind can drop entries). Serving the newest page rather than an
  // empty one keeps the history reachable, the same way the transcript loader
  // recovers from a missing cursor.
  let end = prompts.length;
  if (beforeUuid) {
    const index = prompts.findIndex(entry => entry.uuid === beforeUuid);
    if (index !== -1) end = index;
  }

  const pageSize = limit ?? PROMPT_HISTORY_PAGE_SIZE;

  // Walk back from the newest end, taking entries until either budget is spent.
  // The first entry is taken unconditionally so an oversized prompt still gets a
  // page rather than stalling paging with an empty one.
  let start = end;
  let bytes = 0;
  while (start > 0 && end - start < pageSize) {
    const size = JSON.stringify(prompts[start - 1]).length;
    if (start < end && bytes + size > PROMPT_HISTORY_PAGE_BYTES) break;
    bytes += size;
    start--;
  }

  // The cursor has to be the FIRST entry of the page, and a queued prompt is a
  // queue-operation record with no uuid to be. Extend the page back to an entry
  // that has one, the way the transcript loader snaps its own page boundary: any
  // uuid-less entry left in front of the cursor would be sent again with the next
  // page, and the client can only dedupe by uuid.
  while (start > 0 && typeof prompts[start].uuid !== 'string') start--;

  const entries = prompts.slice(start, end);

  return {
    entries,
    hasMore: start > 0,
    oldestUuid: entries.find(entry => typeof entry.uuid === 'string')?.uuid as string | undefined,
  };
}
