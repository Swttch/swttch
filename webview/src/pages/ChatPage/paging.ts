import { getTextContent, type LoadedMessageDto } from '../../types';
import { isSideSessionsEventText, withoutSystemReminders } from '../../shared';
import { LoadedMessageType } from '../../dto/common';

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
  // A message another session sent is written with `isMeta`, like the CLI's other notes for Claude.
  // It is not something this user typed, and counting it opened a section the backend's index (which
  // already skips it) has no entry for (#657).
  if (message.isMeta) return false;
  // The note about sessions this one started is written as a user entry, but nobody sent it.
  if (isSideSessionsEventText(getTextContent(message))) return false;
  // A note the GUI or the app writes for Claude and nothing else ("The user clicked the cancel button for the
  // background task…") is a `<system-reminder>` and nothing typed. It is drawn as nothing, so counting it opened a
  // section with an empty head and a gap above whatever came after it.
  const text = getTextContent(message);
  if (text.trim() !== '' && withoutSystemReminders(text).trim() === '') return false;
  // The CLI hands Claude the notice that a background task is over as a user entry (marked by its `origin`); no
  // one sent it, and the Transcript view draws it as a line of its own.
  if (message.origin?.kind === 'task-notification') return false;
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
