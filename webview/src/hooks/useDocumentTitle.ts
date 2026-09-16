import { useEffect, useRef } from 'react';
import {
  NotificationKind,
  notify,
  type SoundSelection,
} from '@/notifications';
import { APP_NAME } from '@/config/app';
import { SessionActivity, resolveSessionActivity } from '@/shared';
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
 * This hook owns the favicon outright. Every path that changes it lives here,
 * so the one that runs last is decided by the order the effects are declared
 * below rather than by which component happens to render first.
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
 * @param isAwaitingUser - Whether the CLI has stopped and is waiting for the user to answer
 *   a tool permission, a plan approval, or an AskUserQuestion card. The turn has not ended,
 *   so `isStreaming` is still true throughout — which is exactly why this is passed separately.
 */
export function useDocumentTitle(
  title: string | null,
  isResetSession: boolean,
  isStreaming: boolean,
  soundSelection: SoundSelection,
  error: Error | null,
  isAwaitingUser: boolean,
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

  // Notify JCEF of state changes, so the JetBrains editor tab and tool-window tab
  // draw what this favicon draws. `awaiting` is its own report rather than an
  // `idle` one: a waiting session has not finished, and a tab that reported idle
  // would drop the badge as soon as the user selected it (issue #456).
  //
  // The value comes from `resolveSessionActivity`, the same call that decides
  // what this screen reports to the backend, so the IDE tab and the session list
  // cannot disagree. Only the word for "a turn is in flight" is translated here:
  // this channel has said `streaming` since it existed, and a plugin older than
  // this build reads any word it does not know as idle — so renaming it on the
  // wire would blank the tab icon of everyone who updates the two halves at
  // different times.
  useEffect(() => {
    const notifyJcef = (window as unknown as Record<string, unknown>).__notifyStreamingState;
    if (typeof notifyJcef === 'function') {
      const activity = resolveSessionActivity(isStreaming, isAwaitingUser);
      const state = activity === SessionActivity.Running ? 'streaming' : activity;
      (notifyJcef as (state: string) => void)(state);
    }
  }, [isStreaming, isAwaitingUser]);

  // Turn the favicon while the response streams, so a user who has moved to
  // another browser tab can still see that this session is running (issue #449).
  //
  // A session waiting on the user is NOT turning. The CLI has stopped and the
  // next move is the user's, so advertising it as running is a lie — and the
  // spinner rewrites the favicon every frame, which erased the unread badge the
  // awaiting effect below puts up (issue #456).
  //
  // The waiting badge is NOT conditional on the tab being hidden, unlike the
  // streaming-end badge below. "Answer me" is addressed to the user wherever
  // they are looking, and a badge that only appeared behind their back would be
  // missing from the one tab that can actually answer.
  //
  // Declared BEFORE the unread effect below, and that order matters: ending a
  // stream settles the icon here first and only then runs that effect, so the
  // unread variant is what survives.
  const wasAwaitingUserRef = useRef(false);
  useEffect(() => {
    if (isStreaming && !isAwaitingUser) {
      startWorkingFavicon();
    } else {
      stopWorkingFavicon();
      if (isAwaitingUser) {
        setUnreadFavicon();
      } else if (wasAwaitingUserRef.current) {
        // The wait ended without the turn resuming, which is what cancelling a
        // prompt looks like. Nothing else would take the badge down: the call
        // above restores the default only when something was actually turning,
        // and no visibility change is coming for a tab already in front of the
        // user. Guarded on the transition so that merely mounting this hook
        // never clears a badge put up by something else.
        restoreDefaultFavicon();
      }
    }
    wasAwaitingUserRef.current = isAwaitingUser;
    return () => stopWorkingFavicon();
  }, [isStreaming, isAwaitingUser]);

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
  // unread state is correctly cleared.
  //
  // A session waiting on an answer keeps its badge. Coming back to the tab is
  // what clears "you missed the end of a turn", because looking at it IS reading
  // it; it is not what clears "answer me", which ends when the user answers.
  //
  // The listener is registered once, so it cannot read the current value from
  // the closure it was created in — hence the ref.
  const isAwaitingUserRef = useRef(isAwaitingUser);
  useEffect(() => {
    isAwaitingUserRef.current = isAwaitingUser;
  }, [isAwaitingUser]);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (isAwaitingUserRef.current) return;
      if (!document.hidden && hasUnreadFavicon()) {
        restoreDefaultFavicon();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

}
