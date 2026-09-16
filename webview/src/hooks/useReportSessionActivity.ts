import { useEffect } from 'react';
import { useBridge } from './useBridge';
import { MessageType, resolveSessionActivity } from '@/shared';

/**
 * Tell the backend what this screen is doing, so every session list says the
 * same thing this screen says (issue #456).
 *
 * The backend used to work the answer out for itself, from the moment it wrote
 * a message to the CLI's stdin. That is blind to every turn the CLI starts
 * without being asked — a background task finishing, a Stop hook, a message from
 * another session — and on those turns the transcript animated, the favicon
 * turned, and the row in the session list sat still.
 *
 * So the answer now travels from the one place it already exists. `running` is
 * the exact condition the streaming animation is drawn under and `awaiting` is
 * the exact condition a prompt is on screen, which is what makes the row, the
 * favicon and the IDE tab icon agree by construction rather than by two rules
 * happening to match.
 *
 * Reported on every move and once on mount. The mount report matters for the
 * screen that reconnects midway through someone else's turn: without it the
 * backend would still be holding whatever the last screen said before it left.
 *
 * Fire and forget. A dropped report costs one stale row until the next move,
 * and the backend keeps its own safety nets for the case this screen cannot
 * report at all, which is the CLI process dying.
 */
export function useReportSessionActivity(
  sessionId: string | null,
  isStreaming: boolean,
  isAwaitingUser: boolean,
): void {
  const { send } = useBridge();

  useEffect(() => {
    if (!sessionId) return;
    void send(MessageType.REPORT_SESSION_ACTIVITY, {
      sessionId,
      activity: resolveSessionActivity(isStreaming, isAwaitingUser),
    }).catch(() => {});
  }, [sessionId, isStreaming, isAwaitingUser, send]);
}
