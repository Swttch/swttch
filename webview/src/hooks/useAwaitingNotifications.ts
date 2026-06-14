import { useEffect, useRef } from 'react';
import {
  NotificationKind,
  notify,
  shouldNotifyForBackgroundEvent,
  type SoundSelection,
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
 * Gated by shouldNotifyForBackgroundEvent(): in the browser this fires only
 * while the tab is hidden — if the user is already viewing the session, both
 * the OS notification and the unread badge would be redundant noise. In JCEF it
 * always fires and the IDE host focus-gates the native notification instead. The
 * favicon is restored by useDocumentTitle's visibilitychange handler, which
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
  soundSelection: SoundSelection,
  signals: AwaitingSignals,
) {
  const sessionTitleRef = useRef(sessionTitle);
  const soundSelectionRef = useRef(soundSelection);
  useEffect(() => {
    sessionTitleRef.current = sessionTitle;
  }, [sessionTitle]);
  useEffect(() => {
    soundSelectionRef.current = soundSelection;
  }, [soundSelection]);

  const wasPendingPermissionRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingPermission;
    if (isPending && !wasPendingPermissionRef.current && shouldNotifyForBackgroundEvent()) {
      notify(
        NotificationKind.AWAITING_PERMISSION,
        { sessionTitle: sessionTitleRef.current },
        soundSelectionRef.current,
      );
    }
    wasPendingPermissionRef.current = isPending;
  }, [signals.pendingPermission]);

  const wasPendingPlanRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingPlanApproval;
    if (isPending && !wasPendingPlanRef.current && shouldNotifyForBackgroundEvent()) {
      notify(
        NotificationKind.AWAITING_PLAN_APPROVAL,
        { sessionTitle: sessionTitleRef.current },
        soundSelectionRef.current,
      );
    }
    wasPendingPlanRef.current = isPending;
  }, [signals.pendingPlanApproval]);

  const wasPendingUserAnswerRef = useRef(false);
  useEffect(() => {
    const isPending = signals.pendingUserAnswer;
    if (isPending && !wasPendingUserAnswerRef.current && shouldNotifyForBackgroundEvent()) {
      notify(
        NotificationKind.AWAITING_USER_INPUT,
        { sessionTitle: sessionTitleRef.current },
        soundSelectionRef.current,
      );
    }
    wasPendingUserAnswerRef.current = isPending;
  }, [signals.pendingUserAnswer]);
}
