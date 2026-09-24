import { useCallback, useEffect, useRef } from 'react';
import {
  NotificationKind,
  playNotificationSound,
  shouldNotifyForBackgroundEvent,
  showNotificationBanner,
  type NotificationContext,
} from '@/notifications';

interface AwaitingSignals {
  /** Becomes truthy while the user has a pending tool-permission request. */
  pendingPermission: boolean;
  /** Becomes truthy while the agent is waiting on a plan approval/rejection. */
  pendingPlanApproval: boolean;
  /** Becomes truthy while AskUserQuestion is waiting on the user's answer. */
  pendingUserAnswer: boolean;
}

/**
 * Fires desktop notifications when the app transitions into a state that needs
 * the user's attention (currently: pending tool-permission, plan-approval, or
 * user-question prompts).
 *
 * The sound and the banner are raised on different conditions, and that split
 * is the point of this hook's shape. The sound plays on every transition into a
 * waiting state, because "it stopped and it is asking you something" is worth
 * hearing while looking straight at the session. The banner is gated by
 * shouldNotifyForBackgroundEvent(): in the browser it fires only while the tab
 * is hidden — if the user is already viewing the session, both the banner and
 * the unread badge would be redundant noise. In JCEF it always passes here and
 * the IDE host focus-gates the native notification instead.
 *
 * That "is the user elsewhere" question is the only one this hook answers. Both
 * of the others — which sound to ring, and whether banners are wanted at all —
 * are the backend's, read from the settings file at the moment each one fires.
 * Neither is held here, so neither can go stale while the settings overlay is
 * open on top of this screen.
 *
 * The favicon is restored by useDocumentTitle's visibilitychange handler, which
 * reads the DOM directly so any source can set the unread state.
 *
 * The favicon is NOT set here, though it used to be (issue #456). The badge and
 * the notification answer different questions: a notification asks whether to
 * interrupt someone who is elsewhere, while the badge states what the session is
 * doing and is true wherever the user is looking. Putting the badge behind
 * `document.hidden` meant the tab in front of the user never wore it. It now
 * belongs to `useDocumentTitle`, which owns every other favicon path too, so
 * that the spinner and the badge are decided in one place instead of racing.
 */
export function useAwaitingNotifications(
  sessionTitle: string | null,
  signals: AwaitingSignals,
) {
  const sessionTitleRef = useRef(sessionTitle);
  useEffect(() => {
    sessionTitleRef.current = sessionTitle;
  }, [sessionTitle]);

  // One shape for all three transitions, so the sound/banner split is written
  // once instead of being re-derived (and mis-derived) per prompt kind. Reads
  // only refs, so it never needs rebinding and the effects below stay keyed to
  // their own signal alone.
  const announce = useCallback((kind: NotificationKind) => {
    const ctx: NotificationContext = { sessionTitle: sessionTitleRef.current };
    playNotificationSound();
    if (shouldNotifyForBackgroundEvent()) {
      void showNotificationBanner(kind, ctx);
    }
  }, []);

  const wasPendingPermissionRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingPermission;
    if (isPending && !wasPendingPermissionRef.current) {
      announce(NotificationKind.AWAITING_PERMISSION);
    }
    wasPendingPermissionRef.current = isPending;
  }, [signals.pendingPermission, announce]);

  const wasPendingPlanRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingPlanApproval;
    if (isPending && !wasPendingPlanRef.current) {
      announce(NotificationKind.AWAITING_PLAN_APPROVAL);
    }
    wasPendingPlanRef.current = isPending;
  }, [signals.pendingPlanApproval, announce]);

  const wasPendingUserAnswerRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingUserAnswer;
    if (isPending && !wasPendingUserAnswerRef.current) {
      announce(NotificationKind.AWAITING_USER_INPUT);
    }
    wasPendingUserAnswerRef.current = isPending;
  }, [signals.pendingUserAnswer, announce]);
}
