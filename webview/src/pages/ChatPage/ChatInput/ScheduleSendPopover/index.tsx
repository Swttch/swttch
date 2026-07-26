import { useMemo, useState } from 'react';
import { ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { MessageType, ScheduledMessageKind } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useTranslation } from '@/i18n';
import { isMobile } from '@/config/environment';
import {
  SchedulePresetId,
  RELATIVE_PRESETS,
  PRESET_LABEL_KEY,
  resolvePresetSendAt,
  toDatetimeLocalValue,
} from './presets';

interface Props {
  /** Close the popover (Esc, backdrop, X, or a successful schedule). */
  onClose: () => void;
}

/**
 * "Schedule send" popover — the generic scheduled-message feature exposed from
 * the command palette's Context section. It pre-fills its message box from the
 * composer's current draft (so a sentence already typed carries over), lets the
 * user pick a send time (one-tap presets + a free-form datetime), and creates a
 * USER_SCHEDULED reservation bound to the current session.
 *
 * Sponsor-only, but the popover stays OPEN and interactive for everyone: the
 * gate lives on submit (pattern B — ensureSponsor queries the backend fresh and
 * shows the invite toast on failure). The Sponsor badge sits to the right of the
 * title so non-sponsors see up front what unlocking buys.
 */
export function ScheduleSendPopover(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('commandPalette');
  const { send } = useBridgeContext();
  const { currentSessionId } = useSessionContext();
  const { input: composerDraft } = useChatInputState();

  // Message seeds from the composer draft; editable independently afterwards.
  const [message, setMessage] = useState(composerDraft);
  const [preset, setPreset] = useState<SchedulePresetId>(SchedulePresetId.In1Hour);
  // The custom datetime-local value, seeded to now + 1h so the field is never empty.
  const [customValue, setCustomValue] = useState(() =>
    toDatetimeLocalValue(resolvePresetSendAt(SchedulePresetId.In1Hour, Date.now())),
  );
  const [submitting, setSubmitting] = useState(false);

  // The resolved send time for the current selection. Custom reads the input;
  // every other preset is a fixed offset from now (recomputed at submit).
  const canSubmit = useMemo(() => {
    if (!currentSessionId || !message.trim()) return false;
    if (preset === SchedulePresetId.Custom) {
      const ms = Date.parse(customValue);
      return !Number.isNaN(ms);
    }
    return true;
  }, [currentSessionId, message, preset, customValue]);

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit || !currentSessionId || submitting) return;

    // Resolve the absolute send time now (presets are relative to submit time).
    const sendAtDate =
      preset === SchedulePresetId.Custom
        ? new Date(Date.parse(customValue))
        : resolvePresetSendAt(preset, Date.now());

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
      className={`flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-lg ${
        isMobile() ? 'w-full min-w-0' : 'min-w-[340px]'
      }`}
    >
      {/* Title row: label + Sponsor badge on the right, then close. */}
      <div className="flex items-center gap-2">
        <ClockIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
        <span className="text-[0.9rem] font-medium text-text-primary">
          {t('scheduleSend.title')}
        </span>
        <SettingBadge variant={SettingBadgeVariant.Sponsor} />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('scheduleSend.close')}
          className="ms-auto flex-shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Message box — pre-filled from the composer draft, editable. */}
      <label className="flex flex-col gap-1">
        <span className="text-[0.8rem] text-text-tertiary">{t('scheduleSend.messageLabel')}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('scheduleSend.messagePlaceholder')}
          rows={3}
          className="resize-none rounded-md border border-border-default bg-surface-overlay px-2.5 py-2 text-[0.85rem] text-text-primary placeholder-text-tertiary focus:border-border-strong focus:outline-none"
        />
      </label>

      {/* Time selection: preset chips + a custom datetime input. */}
      <div className="flex flex-col gap-2">
        <span className="text-[0.8rem] text-text-tertiary">{t('scheduleSend.whenLabel')}</span>
        <div className="flex flex-wrap gap-1.5">
          {RELATIVE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-md px-2.5 py-1 text-[0.8rem] transition-colors ${
                preset === p
                  ? 'bg-accent-claude/20 text-accent-claude'
                  : 'bg-surface-overlay text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {t(PRESET_LABEL_KEY[p])}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset(SchedulePresetId.Custom)}
            className={`rounded-md px-2.5 py-1 text-[0.8rem] transition-colors ${
              preset === SchedulePresetId.Custom
                ? 'bg-accent-claude/20 text-accent-claude'
                : 'bg-surface-overlay text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {t(PRESET_LABEL_KEY[SchedulePresetId.Custom])}
          </button>
        </div>
        {preset === SchedulePresetId.Custom && (
          <input
            type="datetime-local"
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
