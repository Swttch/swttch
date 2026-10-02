import { useCallback, useMemo } from 'react';
import type { LoadedMessageDto } from '../../types';
import { useAutoScroll, type UseAutoScroll } from '@/hooks/useAutoScroll';
import { findNewestUserUuid } from './paging';

export interface UseChatAutoScroll extends UseAutoScroll {
  /** The scroll handler's "remember where I am" part, exactly as it always ran. */
  rememberScrollPosition: () => void;
}

/**
 * The main chat's auto-scroll, wired the way the chat page always wired it.
 *
 * Kept in one place so the equivalence test can drive the exact wiring the page
 * uses: the remembered position is read under `claude-gui:scroll:<session id>`
 * whatever the id is (as the page always read it, `null` included), but only
 * written once there is a session id, and a send is detected from the newest
 * user message's uuid changing (not "last array element is user" — a
 * non-streaming send also appends an assistant placeholder after it).
 */
export function useChatAutoScroll(
  currentSessionId: string | null,
  messages: LoadedMessageDto[],
  isStreaming: boolean,
): UseChatAutoScroll {
  const newestUserUuid = useMemo(() => findNewestUserUuid(messages), [messages]);
  const autoScroll = useAutoScroll({
    resetKey: currentSessionId,
    storageKey: `claude-gui:scroll:${currentSessionId}`,
    hasContent: messages.length > 0,
    isStreaming,
    rearmKey: newestUserUuid,
  });

  const { handleScroll } = autoScroll;
  const rememberScrollPosition = useCallback(() => {
    if (currentSessionId) handleScroll();
  }, [currentSessionId, handleScroll]);

  return { ...autoScroll, rememberScrollPosition };
}
