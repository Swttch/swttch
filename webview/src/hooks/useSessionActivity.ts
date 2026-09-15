import { useCallback, useEffect, useState } from 'react';
import { useBridge } from './useBridge';
import { MessageType, SessionActivity, type SessionActivityMap } from '@/shared';

interface ActivityPayload {
  activity?: SessionActivityMap;
  /** Ids of the sessions some tab currently has open. */
  open?: string[];
}

interface ActivityAck extends ActivityPayload {
  status?: string;
}

export interface UseSessionActivityReturn {
  /** What each non-idle session is doing. Sessions absent from it are idle. */
  activity: SessionActivityMap;
  /**
   * Sessions a tab currently has open. A session outside this is closed:
   * nothing is watching it, and a row says so by drawing no marker at all.
   */
  open: Set<string>;
  /** Tell the backend the user has now looked at this session. */
  markRead: (sessionId: string) => void;
}

/**
 * What the sessions are doing, from the backend (issue #449).
 *
 * A session list shows conversations that may be running in another tab,
 * another IDE window, or a browser elsewhere on this machine. Only the backend
 * sees all of them, so the state comes from there rather than from this
 * webview's own stream.
 *
 * Two sources, because neither covers the whole picture alone. The backend
 * pushes the map on every change, which keeps a long-lived list correct; and the
 * map is read once on mount, because a webview that connected midway through
 * someone else's turn never saw that turn's announcement.
 *
 * The map travels whole rather than as deltas, so a dropped message costs one
 * stale render rather than a permanently wrong row.
 */
export function useSessionActivity(): UseSessionActivityReturn {
  const { send, subscribe } = useBridge();
  const [activity, setActivity] = useState<SessionActivityMap>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await send<ActivityAck>(MessageType.GET_SESSION_ACTIVITY, {});
        if (cancelled || res.status !== 'ok') return;
        setActivity(res.activity ?? {});
        setOpen(new Set(res.open ?? []));
      } catch {
        // Not knowing is the same as everything being idle: every row renders
        // with the ordinary marker, which is what it did before this existed.
      }
    })();

    const unsubscribe = subscribe(MessageType.SESSION_ACTIVITY_CHANGED, (message) => {
      const payload = message.payload as ActivityPayload | undefined;
      setActivity(payload?.activity ?? {});
      setOpen(new Set(payload?.open ?? []));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [send, subscribe]);

  const markRead = useCallback(
    (sessionId: string) => {
      // Fire and forget: the answer is the push that follows, and a failed
      // read simply leaves the row marked until the next time the user looks.
      void send(MessageType.MARK_SESSION_READ, { sessionId }).catch(() => {});
    },
    [send],
  );

  return { activity, open, markRead };
}

/** What a row should show for a session, with absence meaning idle. */
export function activityOf(
  activity: SessionActivityMap,
  sessionId: string,
): SessionActivity {
  return activity[sessionId] ?? SessionActivity.Idle;
}
