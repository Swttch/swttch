import { useEffect } from 'react';
import { useSessionActivity } from './useSessionActivity';

/**
 * Tell the backend the user has looked at the session this view is showing, so
 * its row in the session list stops reading as finished-but-unread (issue #449).
 *
 * The condition is the same one that clears this tab's own unread favicon: the
 * tab is visible, and it is showing this session. Reusing it is the point —
 * the list marker and the tab badge are meant to be the same statement, and a
 * second rule invented here would drift from the first one over time.
 *
 * Reported whenever the tab becomes visible, and again whenever the streaming
 * state moves. The second covers a turn that finishes while the user is already
 * sitting on the tab: nothing about visibility changes then, so waiting for a
 * visibility event would leave the row green until they switched away and back.
 *
 * Only a finished turn is actually cleared; the backend ignores this for a
 * session that is still running, which is why sending it on every visibility
 * change is safe.
 */
export function useMarkSessionRead(sessionId: string | null, isStreaming: boolean): void {
  const { markRead } = useSessionActivity();

  useEffect(() => {
    if (!sessionId) return;

    const reportIfVisible = () => {
      if (!document.hidden) markRead(sessionId);
    };

    reportIfVisible();
    document.addEventListener('visibilitychange', reportIfVisible);
    return () => document.removeEventListener('visibilitychange', reportIfVisible);
  }, [sessionId, isStreaming, markRead]);
}
