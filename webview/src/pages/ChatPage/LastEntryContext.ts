import { createContext, useContext } from 'react';
import type { LoadedMessageDto } from '../../types';

/**
 * The uuid of the last user or assistant entry in the transcript — the one the
 * chat ends on. Its `MessageFooter` stays shown without a hover, so the copy
 * button and the time of the latest exchange are always in reach (issue #498).
 *
 * Only user and assistant entries count. The CLI writes bookkeeping after a
 * reply (attachments, a `system` stop-hook summary, `last-prompt`), and those
 * draw little or nothing; letting one of them be "last" would leave the reply
 * the reader is actually looking at without its footer.
 *
 * A context rather than a prop because `MessageBubble` is memoised: routing the
 * value through it would re-render every bubble whenever a new entry arrives.
 * `null` outside the chat (the agent transcript modals), where nothing is last.
 */
export const LastEntryContext = createContext<string | null>(null);

export function useLastEntryUuid(): string | null {
  return useContext(LastEntryContext);
}

export function lastEntryUuid(messages: LoadedMessageDto[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type === 'user' || message.type === 'assistant') return message.uuid ?? null;
  }
  return null;
}
