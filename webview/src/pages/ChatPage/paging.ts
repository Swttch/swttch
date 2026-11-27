import { type LoadedMessageDto } from '../../types';
import { isUserSendEntry } from '../../shared';

/**
 * Whether an entry is something the user sent. The rule is `isUserSendEntry` in shared/, which the backend's list of
 * sends reads too: the sections of the chat, the send index and the composer's history answer to it alone (#735).
 */
export function isUserSend(message: LoadedMessageDto): boolean {
  return isUserSendEntry(message);
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
