import { useRef } from 'react';
import type { LoadedMessageDto } from '@/types';
import { findNewestUserUuid } from '@/pages/ChatPage/paging';

/**
 * The `rearmKey` for an agent's transcript (see useAutoScroll).
 *
 * Two things say the user has just sent something here, and either one has to
 * switch following back on:
 *  - the send itself, counted by the modal the moment the composer sends. This
 *    is what the main chat gets for free, where a send is put on screen at
 *    once; an agent's transcript only shows the message after the CLI has
 *    resumed the agent and written it down.
 *  - the newest message the user sent changing in the transcript, which is the
 *    same signal the main chat watches (`findNewestUserUuid`).
 *
 * Null until there is either, so nothing is re-armed for a transcript the user
 * has not sent anything to.
 */
export function agentRearmKey(newestUserUuid: string | null, sendCount: number): string | null {
  if (!newestUserUuid && sendCount === 0) return null;
  return `${newestUserUuid ?? ''}#${sendCount}`;
}

/**
 * The `rearmKey` of an agent's record, read from its messages.
 *
 * `findNewestUserUuid` is not changed by a page of older messages put in front, except when the page that was loaded
 * first holds no message the user sent (an agent's prompt is on the first page of its record, and the newest page
 * may not reach it): the page before then brings the prompt, which would read as a send just made, switch following
 * back on and carry the reader to the bottom as they ask for earlier messages. A send that is found only by loading
 * earlier, with nothing new at the end, is therefore not one; a newer send than it, or another message at the end
 * followed by a send, still is.
 */
export function useAgentRearmKey(messages: LoadedMessageDto[], sendCount: number): string | null {
  const newest = findNewestUserUuid(messages);
  const lastUuid = messages[messages.length - 1]?.uuid ?? null;
  const seen = useRef<{ lastUuid: string | null; newest: string | null; ignored: string | null }>({
    lastUuid: null,
    newest: null,
    ignored: null,
  });
  const before = seen.current;
  let ignored = before.ignored;
  if (newest !== null && newest !== ignored && before.newest === null && before.lastUuid !== null && before.lastUuid === lastUuid) {
    ignored = newest;
  }
  const effective = newest !== null && newest === ignored ? null : newest;
  seen.current = { lastUuid, newest: effective, ignored };
  return agentRearmKey(effective, sendCount);
}
