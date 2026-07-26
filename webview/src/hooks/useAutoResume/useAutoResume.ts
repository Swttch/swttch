import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageType,
  ScheduledMessageKind,
  AutoResumeStatusPhase,
  type ScheduledMessage,
} from '@/shared';
import { LoadedMessageType, getTextContent, type LoadedMessageDto } from '@/types';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { useAutoResumeOverride } from '@/contexts/AutoResumeOverrideContext';
import { notify } from '@/notifications';
import { NotificationKind, SOUND_OFF } from '@/notifications/types';
import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import {
  AUTO_RESUME_MESSAGE,
  computeSendAt,
  computeCountdownSeconds,
  resolveAutoResumeStatusKey,
  isLimitReachedText,
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
  /** True when this install holds a sponsor entitlement (gates the whole feature). */
  isSponsor: boolean;
  /** The persisted `autoResumeOnLimit` preference (seeds auto-scheduling). */
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
      if (isLimitReachedText(text)) {
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
 * event) so it persists across re-entry. Reservation state comes from the
 * backend engine:
 *   - SCHEDULED_MESSAGE_UPDATED (+ initial GET_SCHEDULED_MESSAGES) → the session's
 *     AUTO_RESUME reservation
 *   - AUTO_RESUME_STATUS → live progress/failure of the pre-send gate
 * Sponsor-only: non-sponsors get `action: null`; the backend also rejects
 * SCHEDULE_MESSAGE defensively.
 */
export function useAutoResume(): UseAutoResumeResult {
  const { send, subscribe, isConnected } = useBridgeContext();
  const { currentSessionId, inputMode } = useSessionContext();
  const { sendMessage, messages } = useChatStreamContext();
  const { settings } = useSettings();
  const { isSponsor } = useSponsorStatus();
  const { getOverride } = useAutoResumeOverride();

  // Effective preference = session override ?? global default (app setting).
  // Modeled on Cursor's thinking/fast-mode: the global setting seeds each
  // session, but a session can flip it on the fly without touching the global.
  const globalDefault = settings[SettingKey.AUTO_RESUME_ON_LIMIT] ?? false;
  const autoResumeEnabled = getOverride(currentSessionId) ?? globalDefault;

  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
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
    () => schedules.find((s) => s.kind === ScheduledMessageKind.AUTO_RESUME) ?? null,
    [schedules],
  );

  // ── Reset reservation/status state when the active session changes ───────────
  useEffect(() => {
    setSchedules([]);
    setStatus(null);
    setResolvedUuid(null);
  }, [currentSessionId]);

  // ── Initial reservation fetch for the current session ───────────────────────
  useEffect(() => {
    if (!isConnected || !currentSessionId) return;
    let cancelled = false;
    void send<{ schedules?: ScheduledMessage[] }>(MessageType.GET_SCHEDULED_MESSAGES, {
      sessionId: currentSessionId,
    })
      .then((res) => {
        if (!cancelled && Array.isArray(res?.schedules)) setSchedules(res.schedules);
      })
      .catch(() => {
        /* best-effort; a missing list just means "no reservations yet" */
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, currentSessionId, send]);

  // ── Subscriptions (filtered to the current session) ─────────────────────────
  useEffect(() => {
    if (!currentSessionId) return;

    const unsubSchedules = subscribe(MessageType.SCHEDULED_MESSAGE_UPDATED, (message) => {
      const p = message.payload as
        | { sessionId?: string; schedules?: ScheduledMessage[] }
        | undefined;
      if (!p || p.sessionId !== currentSessionId) return;
      setSchedules(Array.isArray(p.schedules) ? p.schedules : []);
    });

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

    return () => {
      unsubSchedules();
      unsubStatus();
    };
  }, [currentSessionId, subscribe]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const schedule = useCallback(() => {
    if (!currentSessionId || !isSponsor) return;
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
        /* backend also enforces sponsor gate; ignore failures here */
      });
  }, [currentSessionId, isSponsor, limit?.resetsAt, send]);

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

  const resumeNow = useCallback(() => {
    if (!isSponsor) return;
    setStatus(null);
    sendMessage(AUTO_RESUME_MESSAGE, inputMode);
  }, [isSponsor, sendMessage, inputMode]);

  // ── Auto-cancel a reservation when the limit is no longer active ─────────────
  // deriveLimit already drops `limit` once the user types again; when that
  // happens with a reservation still pending, cancel it (spec 4).
  useEffect(() => {
    if (!limit && scheduled) cancelReservation(false);
  }, [limit, scheduled, cancelReservation]);

  // ── Auto-schedule when the preference is on ─────────────────────────────────
  const autoScheduledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!limit || !isSponsor || !autoResumeEnabled) return;
    const resetsAt = limit.resetsAt;
    if (!resetsAt) return;
    if (scheduled) return;
    if (Date.parse(resetsAt) <= Date.now()) return; // already past → resumeNow, not schedule
    const guardKey = `${limit.messageUuid}:${resetsAt}`;
    if (autoScheduledForRef.current === guardKey) return;
    autoScheduledForRef.current = guardKey;
    schedule();
  }, [limit, isSponsor, autoResumeEnabled, scheduled, schedule]);

  // ── Countdown tick + one-shot browser notification at reset ─────────────────
  const resetsAtMs = useMemo(
    () => (scheduled ? Date.parse(scheduled.sendAt) - 30_000 : NaN),
    [scheduled],
  );
  const countdownSeconds =
    scheduled && !Number.isNaN(resetsAtMs) ? computeCountdownSeconds(resetsAtMs, nowMs) : null;

  useEffect(() => {
    if (!scheduled || Number.isNaN(resetsAtMs)) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [scheduled, resetsAtMs]);

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
    if (!limit || !isSponsor) return null;
    // Once the gate is delivering the resume (PROCEEDING), drop the button so it
    // never lingers as "재개하기": normally the delivered `continue` message
    // clears `limit` on its own, but if that message never lands (e.g. the
    // session process is gone) we still don't want a stale action.
    if (status?.phase === AutoResumeStatusPhase.PROCEEDING) return null;
    if (scheduled) return 'cancel';
    if (limit.resetsAt && Date.parse(limit.resetsAt) > Date.now()) return 'schedule';
    return 'resumeNow';
  }, [limit, isSponsor, scheduled, status]);

  const statusKey = resolveAutoResumeStatusKey(status);

  return {
    isSponsor,
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
