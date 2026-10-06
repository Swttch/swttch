import { useEffect, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { contextWindowFromReport } from '@/utils/contextWindow';
import { MessageType } from '@/shared';

/** Sessions with an ask in flight. A failed ask is removed so a later visit tries again. */
const asked = new Set<string>();

interface ContextUsageAck {
  status?: string;
  markdown?: string;
}

/**
 * Learns the context window size of a session that was opened from disk.
 *
 * The CLI reports the size only when a turn ends, so a session reopened before
 * its next reply knows its tokens (from the saved history) but not its window,
 * and the gauge could show no percentage (#328). The official `/context` command
 * answers it, and the backend runs that as a one-shot that leaves no trace in
 * the session's history.
 *
 * Quiet by design: nothing is added to the conversation, and nothing runs while
 * a turn is streaming, because that turn's own result delivers the size.
 */
export function useContextWindowProbe(): void {
  const bridge = useBridgeContext();
  const { currentSessionId, workingDirectory } = useSessionContext();
  const { contextWindowUsage, isStreaming, applyContextWindow } = useChatStreamContext();

  const hasHistory = (contextWindowUsage?.totalTokens ?? 0) > 0;
  const windowUnknown = (contextWindowUsage?.contextWindow ?? 0) <= 0;

  // The answer takes seconds. By then the user may be in another session, whose
  // gauge it must not fill.
  const currentSessionRef = useRef(currentSessionId);
  currentSessionRef.current = currentSessionId;

  useEffect(() => {
    if (!currentSessionId || !hasHistory || !windowUnknown || isStreaming || !bridge.isConnected) return;
    const sessionId = currentSessionId;
    if (asked.has(sessionId)) return;
    asked.add(sessionId);

    bridge
      .send(MessageType.GET_CONTEXT_USAGE, { sessionId, workingDir: workingDirectory ?? '' })
      .then((response) => {
        const ack = response as ContextUsageAck | null;
        const size = ack?.status === 'ok' && ack.markdown ? contextWindowFromReport(ack.markdown) : null;
        asked.delete(sessionId);
        if (size === null) return;
        if (currentSessionRef.current === sessionId) applyContextWindow(size);
      })
      .catch(() => asked.delete(sessionId));
  }, [currentSessionId, workingDirectory, hasHistory, windowUnknown, isStreaming, bridge, applyContextWindow]);
}
