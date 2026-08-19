import type { LoadedMessageDto } from '../../types';
import { LoadedMessageType } from '../../dto/common';

/**
 * Decide whether an `oldestLoadedUuid` transition represents an actual
 * older-page prepend (the event the scroll-anchoring layout effect must react
 * to) rather than a streaming update or the initial load.
 *
 * The oldest loaded message only changes when an older page is prepended:
 *  - Streaming deltas grow the *newest* messages, so `oldestLoadedUuid` stays
 *    put -> not a prepend (returning true here is what made the viewport jump).
 *  - The initial load moves the oldest from `null` to a real value; that is not
 *    a prepend either, so a `null` previous value is excluded.
 *
 * A prepend is therefore: the previous oldest was a real (non-null) uuid AND
 * the current oldest differs from it.
 */
export function isOlderPagePrepend(
  prevOldestUuid: string | null,
  currentOldestUuid: string | null,
): boolean {
  return prevOldestUuid !== null && currentOldestUuid !== prevOldestUuid;
}

/**
 * Whether a `User` type entry is something the human actually sent.
 *
 * `LoadedMessageType.User` is the raw JSONL line type, and the CLI writes tool
 * results as `type: "user"` entries too — in real sessions they outnumber
 * genuine sends by roughly 10 to 1. Telling them apart therefore needs the
 * content shape, not the type:
 *  - a send carries a plain string, or `text`/`image` blocks (typed text, with
 *    any pasted images)
 *  - a tool result carries a `tool_result` block (and a `toolUseResult` field)
 *
 * Entries the CLI authors itself are excluded for the same reason — the user
 * did not send them, so they must not count as a fresh send either: synthetic
 * entries, transcript-only entries, and the carried-over compact summary
 * (which the CLI also emits as an ordinary `user` entry).
 */
export function isUserSend(message: LoadedMessageDto): boolean {
  if (message.type !== LoadedMessageType.User) return false;
  if (message.isSynthetic) return false;
  if (message.isVisibleInTranscriptOnly) return false;
  if (message.isCompactSummary) return false;
  if (message.toolUseResult !== undefined) return false;

  const content = message.message?.content;
  if (typeof content === 'string') return true;
  if (Array.isArray(content)) {
    // A send may mix text and pasted images; a tool result never does.
    return !content.some(block => block?.type === 'tool_result');
  }
  return false;
}

/**
 * Find the uuid of the newest (last, by array position) message the user sent.
 *
 * Used to detect a fresh send so the caller can re-arm auto-follow: a plain
 * "last element is user" check is not enough, because a non-streaming send
 * appends both the user message *and* an assistant placeholder
 * (see `useChatStream.ts` `addUserMessage`), leaving the placeholder as the
 * last array element. Searching from the back for the first sent message
 * correctly skips that placeholder.
 *
 * Matching on `type` alone is not enough either (issue #206): tool results are
 * `type: "user"` entries, so every tool call moved this uuid and yanked the
 * viewport back to the bottom while the user was reading further up. See
 * `isUserSend` for how a genuine send is identified.
 *
 * An older-page prepend inserts past user messages at the *front* of the
 * array, so it never changes which uuid is newest — no false positive there.
 */
export function findNewestUserUuid(messages: LoadedMessageDto[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isUserSend(messages[i])) {
      return messages[i].uuid ?? null;
    }
  }
  return null;
}
