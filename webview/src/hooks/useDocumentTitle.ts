import { useEffect, useRef } from 'react';
import {
  NotificationKind,
  notify,
  type SoundSelection,
} from '@/notifications';
import { APP_NAME } from '@/config/app';
import {
  hasUnreadFavicon,
  restoreDefaultFavicon,
  setUnreadFavicon,
  startWorkingFavicon,
  stopWorkingFavicon,
} from './favicon';

/**
 * Hook to update the document title based on the current session and streaming state.
 *
 * Streaming state is communicated to the JetBrains IDE via a JCEF JS bridge
 * (`window.__notifyStreamingState`), NOT via document.title encoding
 * (Chromium normalizes tab characters in titles, breaking delimiter-based parsing).
 *
 * Also swaps the browser favicon to an unread variant when streaming ends
 * while the tab is hidden, and restores it when the tab becomes visible. In
 * the same condition, fires an OS desktop notification (no-op in JCEF, where
 * the Notification API is unavailable). When the stream ends with an error,
 * fires STREAM_ERROR instead of SESSION_COMPLETE so the user can tell at a
 * glance whether the response succeeded.
 *
 * @param title - The current session title, or null while loading / on reset session.
 * @param isResetSession - True when the current URL is /sessions/new (currentSessionId === null),
 *   meaning this is a confirmed reset session with no active conversation. In this case, even
 *   when title is null, document.title is explicitly set to APP_NAME. When false and title is
 *   null, the cached tab title is preserved (mid-load protection: avoids flashing "Claude Code"
 *   while EditorTabStateService restores the real title).
 * @param isStreaming - Whether a Claude response is currently streaming.
 * @param soundSelection - The user's notification-sound preference (see `useNotificationSound`).
 * @param error - The current stream error (or null) from `useChatStreamContext`.
 */
export function useDocumentTitle(
  title: string | null,
  isResetSession: boolean,
  isStreaming: boolean,
  soundSelection: SoundSelection,
  error: Error | null,
) {
  const wasStreamingRef = useRef(false);

  // Keep latest values in refs so the streaming-end effect always sees them
  // without rebinding on every render.
  const titleRef = useRef(title);
  const soundSelectionRef = useRef(soundSelection);
  const errorRef = useRef(error);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    soundSelectionRef.current = soundSelection;
  }, [soundSelection]);
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  useEffect(() => {
    // Push the session title to the IDE tab.
    // - title present: always reflect it.
    // - title null + isResetSession=true (/sessions/new): confirmed reset session,
    //   explicitly set APP_NAME (fixes "/clear" leaving stale title — bug 2).
    // - title null + isResetSession=false: session is still loading mid-navigation;
    //   do NOT touch document.title to preserve the cached tab title that
    //   EditorTabStateService restored (avoids "Claude Code" flash mid-load).
    if (title) {
      document.title = title;
    } else if (isResetSession) {
      document.title = APP_NAME;
    }
  }, [title, isResetSession]);

  // Notify JCEF of streaming state changes
  useEffect(() => {
    const notifyJcef = (window as unknown as Record<string, unknown>).__notifyStreamingState;
    if (typeof notifyJcef === 'function') {
      (notifyJcef as (state: string) => void)(isStreaming ? 'streaming' : 'idle');
    }
  }, [isStreaming]);

  // Turn the favicon while the response streams, so a user who has moved to
  // another browser tab can still see that this session is running (issue #449).
  //
  // Declared BEFORE the unread effect below, and that order matters: ending a
  // stream runs this cleanup (which puts the default favicon back) and only then
  // the unread effect, so the unread variant is what survives.
  useEffect(() => {
    if (isStreaming) {
      startWorkingFavicon();
    } else {
      stopWorkingFavicon();
    }
    return () => stopWorkingFavicon();
  }, [isStreaming]);

  // Detect streaming end while tab is hidden → show unread favicon + desktop notification
  useEffect(() => {
    if (!isStreaming && wasStreamingRef.current && document.hidden) {
      setUnreadFavicon();
      notify(
        errorRef.current ? NotificationKind.STREAM_ERROR : NotificationKind.SESSION_COMPLETE,
        { sessionTitle: titleRef.current },
        soundSelectionRef.current,
      );
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Restore favicon when tab becomes visible. Reads the current favicon
  // from the DOM rather than a ref so that any code path that sets the
  // unread state (e.g. useAwaitingNotifications) is correctly cleared.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && hasUnreadFavicon()) {
        restoreDefaultFavicon();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

}
