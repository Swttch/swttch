import { useEffect, useMemo, useRef, useState } from 'react';
import { ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { MessageType, ScheduledMessageKind } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { Select, type SelectOption } from '@/components/Select';
import { useTranslation } from '@/i18n';
import { RichInput } from '../RichInput';
import {
  SchedulePresetId,
  PRESET_OPTIONS,
  PRESET_LABEL_KEY,
  ZERO_DURATION,
  type Duration,
  resolvePresetSendAt,
  resolveAfterDurationSendAt,
  durationToMs,
  toDatetimeLocalValue,
} from './presets';

interface Props {
  /** Close the popover (Esc, backdrop, X, or a successful schedule). */
  onClose: () => void;
}

/** The four day/hour/minute/second fields of the "after duration" picker. */
const DURATION_FIELDS: { key: keyof Duration; labelKey: string; max: number }[] = [
  { key: 'days', labelKey: 'scheduleSend.duration.days', max: 365 },
  { key: 'hours', labelKey: 'scheduleSend.duration.hours', max: 23 },
  { key: 'minutes', labelKey: 'scheduleSend.duration.minutes', max: 59 },
  { key: 'seconds', labelKey: 'scheduleSend.duration.seconds', max: 59 },
];

/**
 * "Schedule send" popover — the generic scheduled-message feature exposed from
 * the command palette's Context section. It pre-fills its message box from the
 * composer's current draft (so a sentence already typed carries over), lets the
 * user pick a send time (a preset dropdown, a day/hour/min/sec "after" picker, or
 * a free-form datetime), and creates a USER_SCHEDULED reservation bound to the
 * current session.
 *
 * A feature for sponsors, but the popover stays OPEN and interactive for
 * everyone: the gate lives on submit (pattern B — ensureSponsor queries the
 * backend fresh and shows the invite toast on failure). The Sponsor badge sits
 * to the right of the title so non-sponsors see up front what unlocking buys.
 */
export function ScheduleSendPopover(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('commandPalette');
  const { send } = useBridgeContext();
  const { currentSessionId } = useSessionContext();
  const { input: composerDraft } = useChatInputState();

  const panelRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  // Move focus into the message box on open (the composer keeps focus otherwise),
  // and close on Escape or an outside click — matching ModelSwitchOverlay. The
  // caller (ChatInput) restores focus to the composer when the popover unmounts.
  useEffect(() => {
    messageRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Message seeds from the composer draft; editable independently afterwards.
  const [message, setMessage] = useState(composerDraft);
  const [preset, setPreset] = useState<SchedulePresetId>(SchedulePresetId.In1Hour);
  const [duration, setDuration] = useState<Duration>({ ...ZERO_DURATION, hours: 1 });
  // The custom datetime-local value, seeded to now + 1h so the field is never empty.
  const [customValue, setCustomValue] = useState(() =>
    toDatetimeLocalValue(resolvePresetSendAt(SchedulePresetId.In1Hour, Date.now())),
  );
  const [submitting, setSubmitting] = useState(false);

  const presetOptions: SelectOption[] = PRESET_OPTIONS.map((p) => ({
    value: p,
    label: t(PRESET_LABEL_KEY[p]),
  }));

  // Whether the current selection resolves to a valid future-or-now send time.
  const canSubmit = useMemo(() => {
    if (!currentSessionId || !message.trim()) return false;
    if (preset === SchedulePresetId.Custom) {
      return !Number.isNaN(Date.parse(customValue));
    }
    if (preset === SchedulePresetId.AfterDuration) {
      return durationToMs(duration) > 0;
    }
    return true;
  }, [currentSessionId, message, preset, customValue, duration]);

  const setDurationField = (key: keyof Duration, raw: string): void => {
    const field = DURATION_FIELDS.find((f) => f.key === key)!;
    const n = Math.max(0, Math.min(field.max, Math.floor(Number(raw) || 0)));
    setDuration((prev) => ({ ...prev, [key]: n }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit || !currentSessionId || submitting) return;

    // Resolve the absolute send time now (relative options are relative to submit time).
    let sendAtDate: Date;
    if (preset === SchedulePresetId.Custom) {
      sendAtDate = new Date(Date.parse(customValue));
    } else if (preset === SchedulePresetId.AfterDuration) {
      sendAtDate = resolveAfterDurationSendAt(duration, Date.now());
    } else {
      sendAtDate = resolvePresetSendAt(preset, Date.now());
    }

    setSubmitting(true);
    try {
      // Pattern B: a schedule created here is a frontend action, so verify
      // sponsorship first; ensureSponsor shows the invite toast on failure.
      if (!(await ensureSponsor())) return;

      await send(MessageType.SCHEDULE_MESSAGE, {
        sessionId: currentSessionId,
        sendAt: sendAtDate.toISOString(),
        message: message.trim(),
        kind: ScheduledMessageKind.USER_SCHEDULED,
      });
      toast.success(t('scheduleSend.scheduledToast'));
      onClose();
    } catch {
      // The global IPC interceptor surfaces SPONSOR_REQUIRED; any other failure
      // is a best-effort no-op (the popover stays open so the user can retry).
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="flex w-full flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-lg"
    >
      {/* Title row: label + Sponsor badge on the right, then close. */}
      <div className="flex items-center gap-2">
        <ClockIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
        <span className="text-[0.9rem] font-medium text-text-primary">
          {t('scheduleSend.title')}
        </span>
        <SettingBadge
          variant={SettingBadgeVariant.Sponsor}
          tooltipOverride={t('scheduleSend.sponsorTooltip')}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('scheduleSend.close')}
          className="ms-auto flex-shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Message box — pre-filled from the composer draft. Uses RichInput (the
          same editor as the main composer) so it auto-grows with content and
          inherits the composer's max-height / IME behavior. */}
      <div className="flex flex-col gap-1">
        <span className="text-[0.8rem] text-text-tertiary">{t('scheduleSend.messageLabel')}</span>
        <div className="rounded-md border border-border-default bg-surface-overlay py-2 focus-within:border-border-strong">
          <RichInput
            ref={messageRef}
            value={message}
            onChange={setMessage}
            placeholder={t('scheduleSend.messagePlaceholder')}
            ariaLabel={t('scheduleSend.messageLabel')}
          />
        </div>
      </div>

      {/* Time selection: a preset dropdown, plus the "after duration" fields or
          the custom datetime input depending on the choice. */}
      <div className="flex flex-col gap-2">
        <span className="text-[0.8rem] text-text-tertiary">{t('scheduleSend.whenLabel')}</span>
        <Select
          value={preset}
          options={presetOptions}
          onChange={(v) => setPreset(v as SchedulePresetId)}
          ariaLabel={t('scheduleSend.whenLabel')}
          className="bg-surface-overlay border border-border-default rounded-md px-2.5 py-1.5 text-[0.85rem] text-text-primary"
        />

        {preset === SchedulePresetId.AfterDuration && (
          <div className="flex flex-wrap gap-2">
            {DURATION_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={f.max}
                  value={duration[f.key]}
                  onChange={(e) => setDurationField(f.key, e.target.value)}
                  aria-label={t(f.labelKey)}
                  className="w-14 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[0.85rem] text-text-primary focus:border-border-strong focus:outline-none"
                />
                <span className="text-[0.8rem] text-text-tertiary">{t(f.labelKey)}</span>
              </label>
            ))}
          </div>
        )}

        {preset === SchedulePresetId.Custom && (
          <input
            type="datetime-local"
            // step=1 (second) makes the native picker expose a seconds field, so
            // the user can schedule to the second, not just the minute.
            step={1}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            aria-label={t('scheduleSend.customLabel')}
            className="rounded-md border border-border-default bg-surface-overlay px-2.5 py-1.5 text-[0.85rem] text-text-primary focus:border-border-strong focus:outline-none"
          />
        )}
      </div>

      {/* Submit — always clickable; ensureSponsor gates the actual send. */}
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit || submitting}
        className="rounded-md bg-accent-claude px-3 py-1.5 text-[0.85rem] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('scheduleSend.submit')}
      </button>
    </div>
  );
}
