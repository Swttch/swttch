import { loadPromptChain, type SessionMessage } from './loadSessionMessages';
import { isUserSendEntry, restoreQueuedEntries } from '../../shared';

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
   * The records the page's prompts were read from, in transcript order (oldest first), exactly as they sit in the
   * session file — no field is renamed, dropped or rewritten. A message typed during a turn arrives as its queue
   * records and attachment. Turning them into composer text is the webview's job.
   */
  entries: SessionMessage[];
  /** More prompts exist before this page. */
  hasMore: boolean;
  /** Cursor for the next page: the key of this page's oldest prompt. */
  oldestUuid?: string;
}

/** One message the user sent, under the name the chat knows it by, with the records it was read from. */
export interface RecordedPrompt {
  /** The entry's uuid, or the name a message rebuilt from the queue records is given. A jump and a cursor use it. */
  key: string;
  /** The entry as the chat draws it. */
  entry: SessionMessage;
  /** The records of the file the entry was read from, as written. */
  sources: SessionMessage[];
}

/**
 * The messages the user sent in a chain, in the order the chat draws them.
 *
 * What a send is, is `isUserSendEntry` in shared/, and a message typed while a turn was running, which the CLI wrote
 * only as queue bookkeeping, is put back by `restoreQueuedEntries`. The chat reads the transcript through the same two,
 * so this list, the ticks of the send index and the composer's history cannot disagree about a message (#735).
 */
export function collectPrompts(chain: SessionMessage[]): RecordedPrompt[] {
  const prompts: RecordedPrompt[] = [];
  for (const { entry, sources } of restoreQueuedEntries(chain)) {
    // The chat shows a subagent's own entries inside the call that ran it, never as the user's messages.
    if (entry.isSidechain || !isUserSendEntry(entry) || typeof entry.uuid !== 'string') continue;
    prompts.push({ key: entry.uuid, entry, sources });
  }
  return prompts;
}

/**
 * One page of the prompts sent in a session, newest page first.
 *
 * Mirrors the transcript paging contract on purpose (`beforeUuid` cursor, `hasMore`, `oldestUuid`) so both paths read
 * the same way and neither can drift into its own idea of what a page means.
 */
export async function loadPromptHistory(
  workingDir: string,
  targetSessionId: string,
  beforeUuid?: string,
  limit?: number,
): Promise<PromptHistoryPage> {
  // The prompt history reads user entries, queue records and their attachments, which is all the prompt chain holds.
  const chain = await loadPromptChain(workingDir, targetSessionId);
  const prompts = collectPrompts(chain);

  // A cursor that is not in the list means the chain was rebuilt under the client
  // (an edit or rewind can drop entries). Serving the newest page rather than an
  // empty one keeps the history reachable, the same way the transcript loader
  // recovers from a missing cursor.
  let end = prompts.length;
  if (beforeUuid) {
    const index = prompts.findIndex(prompt => prompt.key === beforeUuid);
    if (index !== -1) end = index;
  }

  const pageSize = limit ?? PROMPT_HISTORY_PAGE_SIZE;

  // Walk back from the newest end, taking prompts until either budget is spent.
  // The first one is taken unconditionally so an oversized prompt still gets a
  // page rather than stalling paging with an empty one.
  let start = end;
  let bytes = 0;
  while (start > 0 && end - start < pageSize) {
    const size = JSON.stringify(prompts[start - 1].sources).length;
    if (start < end && bytes + size > PROMPT_HISTORY_PAGE_BYTES) break;
    bytes += size;
    start--;
  }

  const page = prompts.slice(start, end);

  return {
    entries: page.flatMap(prompt => prompt.sources),
    hasMore: start > 0,
    oldestUuid: page[0]?.key,
  };
}
