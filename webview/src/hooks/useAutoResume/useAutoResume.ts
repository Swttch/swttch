import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageType,
  ScheduledMessageKind,
  AutoResumeStatusPhase,
  type ScheduledMessage,
} from '@/shared';
import { LoadedMessageType, getTextContent, isLimitErrorMessage, type LoadedMessageDto } from '@/types';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useAutoResumeOverride } from '@/contexts/AutoResumeOverrideContext';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { notify } from '@/notifications';
import { NotificationKind, SOUND_OFF } from '@/notifications/types';
import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import { ensureSponsor } from '@/utils/ensureSponsor';
import {
  AUTO_RESUME_MESSAGE,
  computeSendAt,
  computeCountdownSeconds,
  resolveAutoResumeStatusKey,
  parseResetsAtFromText,
  type AutoResumeStatusView,
} from './autoResumeMath';

/** The active usage-limit notice, derived from the session's messages. */
export interface LimitState {
  /** uuid of the assistant message that carries the limit notice. */
  messageUuid: string;
  /** ISO 8601 quota reset time parsed from the notice text, or null. */
  resetsAt: string | null;
  /** The human-readable limit phrase from the CLI message. */
  message: string;
}

/** Which single action button the banner should offer (mutually exclusive). */
export type AutoResumeAction = 'schedule' | 'cancel' | 'resumeNow';

export interface UseAutoResumeResult {
  /**
   * The effective `autoResumeOnLimit` preference. When on, the hook presses
   * `action` for the user; it never unlocks behavior the manual buttons lack.
   */
  autoResumeEnabled: boolean;
  /** The active limit notice, or null when none is showing. */
  limit: LimitState | null;
  /** The AUTO_RESUME reservation for this session, or null when unscheduled. */
  scheduled: ScheduledMessage | null;
  /** i18n key (relative to the `chat` namespace) for the live status line, or null. */
  statusKey: string | null;
  /** Seconds left in the post-reset countdown (30…0), or null when not counting. */
  countdownSeconds: number | null;
  /** The button to show, or null when the banner should not render. */
  action: AutoResumeAction | null;
  /** Schedule an auto-resume reservation (sendAt = resetsAt + 30s). */
  schedule: () => void;
  /** Cancel the pending reservation. */
  cancel: () => void;
  /** Send "continue" immediately via the normal chat path (session is alive). */
  resumeNow: () => void;
}

/**
 * The active limit notice for a session, derived from its messages. Scanning
 * from the end: the newest limit assistant message with NO later user message is
 * "active" (a user message after it means the user typed again → auto-cancel,
 * spec 4). Because it reads the persisted message list — not a live
 * LIMIT_REACHED event — the banner survives session re-entry and reloads.
 */
function deriveLimit(messages: LoadedMessageDto[]): LimitState | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === LoadedMessageType.User) return null;
    if (m.type === LoadedMessageType.Assistant && !m.isStreaming && m.uuid) {
      const text = getTextContent(m);
      if (isLimitErrorMessage(m)) {
        // Anchor the wall-clock reset ("resets 2:40am") to WHEN the limit message
        // arrived, not "now". Otherwise the parser keeps rolling a past time
        // forward to the next day, so a reset that already happened still reads
        // as a future time → wrong "schedule" instead of "resume now".
        const anchorMs = m.timestamp ? Date.parse(m.timestamp) : NaN;
        const anchor = Number.isNaN(anchorMs) ? new Date() : new Date(anchorMs);
        return { messageUuid: m.uuid, resetsAt: parseResetsAtFromText(text, anchor), message: text };
      }
    }
  }
  return null;
}

/**
 * Session-scoped state + actions for "auto-resume on usage-limit reset" (layer 2
 * webview). The limit notice is derived from the session's MESSAGES (not a live
 * event) so it persists across re-entry.
 *
 * ONE feature, one state machine. `action` is the single source of truth for
 * what may happen next on a limit notice — schedule (reset still ahead) → cancel
 * (reservation pending) → resumeNow (reset already passed). The banner renders
 * that action as a button; the `autoResumeOnLimit` preference presses the very
 * same action on the user's behalf. Auto-resume is therefore the FIRST STEP of
 * the manual flow being automated, never a parallel code path with its own
 * conditions — which is what makes the post-schedule UI and behavior identical
 * whether the reservation was booked by hand or automatically.
 *
 * Sponsor gating is NOT done here: the buttons show for everyone. `schedule`
 * just sends SCHEDULE_MESSAGE — the backend rejects non-sponsors with
 * SPONSOR_REQUIRED and the global IPC interceptor shows the invite toast
 * (pattern A). `resumeNow` sends a plain chat message, which can't be gated by
 * the request itself, so it queries `ensureSponsor()` first (pattern B).
 */
export function useAutoResume(): UseAutoResumeResult {
  const { send, subscribe } = useBridgeContext();
  const { currentSessionId, inputMode } = useSessionContext();
  const { sendMessage, messages } = useChatStreamContext();
  const { settings } = useSettings();
  const { getOverride } = useAutoResumeOverride();

  // Effective preference = session override ?? global default (app setting).
  // Modeled on Cursor's thinking/fast-mode: the global setting seeds each
  // session, but a session can flip it on the fly without touching the global.
  const globalDefault = settings[SettingKey.AUTO_RESUME_ON_LIMIT] ?? false;
  const autoResumeEnabled = getOverride(currentSessionId) ?? globalDefault;

  // Reservations come from ScheduledMessagesContext — the SAME list the
  // "예약된 메시지" panel renders. Keeping a second private copy here (its own
  // GET_SCHEDULED_MESSAGES + SCHEDULED_MESSAGE_UPDATED subscription) let the
  // banner and the panel drift apart; one list means the reservation an
  // auto-resume creates is, by construction, the reservation the panel lists.
  const { reservations } = useScheduledMessages();
  const [status, setStatus] = useState<AutoResumeStatusView | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // The active limit notice, derived from the persisted message list.
  const [resolvedUuid, setResolvedUuid] = useState<string | null>(null);
  const rawLimit = useMemo(() => deriveLimit(messages), [messages]);
  // Once the gate delivers the resume (PROCEEDING), mark that limit resolved so
  // the whole banner clears. Normally the delivered `continue` message clears the
  // limit on its own, but if it never lands (e.g. a dead session process) the
  // "재개하는 중" status must not linger.
  const limit = rawLimit && rawLimit.messageUuid === resolvedUuid ? null : rawLimit;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  // The AUTO_RESUME reservation for this session (at most one is expected).
  const scheduled = useMemo(
    () => reservations.find((s) => s.kind === ScheduledMessageKind.AUTO_RESUME) ?? null,
    [reservations],
  );

  // ── Reset status state when the active session changes ──────────────────────
  // The reservation list resets itself in ScheduledMessagesContext.
  useEffect(() => {
    setStatus(null);
    setResolvedUuid(null);
  }, [currentSessionId]);

  // ── Subscriptions (filtered to the current session) ─────────────────────────
  useEffect(() => {
    if (!currentSessionId) return;

    const unsubStatus = subscribe(MessageType.AUTO_RESUME_STATUS, (message) => {
      const p = message.payload as
        | { sessionId?: string; phase?: AutoResumeStatusView['phase']; error?: string; errorKind?: string }
        | undefined;
      if (!p || p.sessionId !== currentSessionId || !p.phase) return;
      setStatus({ phase: p.phase, error: p.error, errorKind: p.errorKind });
      if (p.phase === AutoResumeStatusPhase.PROCEEDING) {
        setResolvedUuid(limitRef.current?.messageUuid ?? null);
      }
    });

    return unsubStatus;
  }, [currentSessionId, subscribe]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  // Pattern A: just send. The backend gates sponsorship and the global IPC
  // interceptor shows the invite toast on SPONSOR_REQUIRED.
  const schedule = useCallback(() => {
    if (!currentSessionId) return;
    const sendAt = computeSendAt(limit?.resetsAt);
    if (!sendAt) return;
    void send(MessageType.SCHEDULE_MESSAGE, {
      sessionId: currentSessionId,
      sendAt,
      message: AUTO_RESUME_MESSAGE,
      kind: ScheduledMessageKind.AUTO_RESUME,
    })
      .then(() => {
        toast.success(i18n.t('chat:autoResume.scheduledToast'));
      })
      .catch(() => {
        /* sponsor gate (and any other failure) handled by the IPC interceptor */
      });
  }, [currentSessionId, limit?.resetsAt, send]);

  const cancelReservation = useCallback(
    (notify: boolean) => {
      if (!currentSessionId || !scheduled) return;
      void send(MessageType.CANCEL_SCHEDULED_MESSAGE, {
        sessionId: currentSessionId,
        id: scheduled.id,
      })
        .then(() => {
          // Only the explicit "실행취소" button toasts; the silent auto-cancel
          // (user typed again after the limit) stays quiet.
          if (notify) toast(i18n.t('chat:autoResume.canceledToast'));
        })
        .catch(() => {
          /* best-effort */
        });
    },
    [currentSessionId, scheduled, send],
  );
  const cancel = useCallback(() => cancelReservation(true), [cancelReservation]);

  // Pattern B: a plain chat message can't be gated by the request, so query
  // sponsorship first; ensureSponsor shows the invite toast on failure.
  const resumeNow = useCallback(async () => {
    if (!(await ensureSponsor())) return;
    setStatus(null);
    sendMessage(AUTO_RESUME_MESSAGE, inputMode);
  }, [sendMessage, inputMode]);

  // ── Auto-cancel a reservation when the limit is no longer active ─────────────
  // deriveLimit already drops `limit` once the user types again; when that
  // happens with a reservation still pending, cancel it (spec 4).
  useEffect(() => {
    if (!limit && scheduled) cancelReservation(false);
  }, [limit, scheduled, cancelReservation]);

  // ── Countdown tick + one-shot browser notification at reset ─────────────────
  const resetsAtMs = useMemo(
    () => (scheduled ? Date.parse(scheduled.sendAt) - 30_000 : NaN),
    [scheduled],
  );
  const countdownSeconds =
    scheduled && !Number.isNaN(resetsAtMs) ? computeCountdownSeconds(resetsAtMs, nowMs) : null;

  // Tick every second while a limit banner is shown, so BOTH the countdown and
  // the schedule→resumeNow transition (once the reset time passes) stay live —
  // action is memoized, so without a re-render it would never re-check the time.
  useEffect(() => {
    if (!limit) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [limit]);

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!scheduled) {
      notifiedRef.current = false;
      return;
    }
    if (countdownSeconds !== null && !notifiedRef.current) {
      notifiedRef.current = true;
      notify(NotificationKind.AUTO_RESUME_COUNTDOWN, { sessionTitle: null }, SOUND_OFF);
    }
  }, [scheduled, countdownSeconds]);

  const action: AutoResumeAction | null = useMemo(() => {
    // The button shows for everyone; sponsor gating happens on click (see
    // schedule/resumeNow). Hidden only when there is no limit, or once the gate
    // is delivering the resume (PROCEEDING) so it never lingers as "재개하기".
    if (!limit) return null;
    if (status?.phase === AutoResumeStatusPhase.PROCEEDING) return null;
    if (scheduled) return 'cancel';
    if (limit.resetsAt && Date.parse(limit.resetsAt) > nowMs) return 'schedule';
    return 'resumeNow';
  }, [limit, scheduled, status, nowMs]);

  // ── Auto-resume = "press the button for the user" ────────────────────────────
  // Turning the preference on does NOT switch to a second, parallel feature: the
  // manual flow (schedule → scheduled → resume) IS the feature, and auto-resume
  // only automates its FIRST step — the click. So this effect deliberately drives
  // whatever `action` currently offers instead of re-deriving its own conditions:
  //   'schedule'  → the reset is still ahead → book the reservation
  //   'resumeNow' → the reset already passed (e.g. the user reopened the session
  //                 after the reset) → resume immediately
  // Re-deriving the conditions here is what previously made the two paths differ:
  // the old guard bailed out when the reset had already passed, so auto-resume
  // did nothing at all in exactly the case where the manual button offered
  // "resume now". Everything after the click (countdown, cancel, gate, status)
  // is shared by construction, because both paths call the same actions.
  //
  // Non-sponsors can't turn the preference on (its toggles are sponsor-gated), so
  // this normally only runs for sponsors; if it somehow runs for a non-sponsor,
  // schedule() is rejected by the backend (the interceptor shows the invite) and
  // resumeNow() pre-checks via ensureSponsor.
  const autoActedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!limit || !autoResumeEnabled) return;
    if (action !== 'schedule' && action !== 'resumeNow') return;
    // One automatic press per (limit notice, action). Keyed by action too, so a
    // banner that ticks past its reset from 'schedule' to 'resumeNow' still gets
    // its one press — without this the guard would swallow the transition.
    const guardKey = `${limit.messageUuid}:${limit.resetsAt ?? 'none'}:${action}`;
    if (autoActedForRef.current === guardKey) return;
    autoActedForRef.current = guardKey;
    if (action === 'schedule') schedule();
    else void resumeNow();
  }, [limit, autoResumeEnabled, action, schedule, resumeNow]);

  const statusKey = resolveAutoResumeStatusKey(status);

  return {
    autoResumeEnabled,
    limit,
    scheduled,
    statusKey,
    countdownSeconds,
    action,
    schedule,
    cancel,
    resumeNow,
  };
}
