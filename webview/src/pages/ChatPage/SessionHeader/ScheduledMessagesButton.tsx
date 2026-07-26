import { ClockIcon } from '@heroicons/react/24/outline';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { useTranslation } from '@/i18n';

/**
 * Toggles the scheduled-messages panel. Hidden until this session has at least
 * one reservation (mirrors BackgroundTasksButton); shows a count badge.
 */
export function ScheduledMessagesButton() {
  const { t } = useTranslation('chat');
  const { reservations, panelOpen, openPanel, closePanel } = useScheduledMessages();
  if (reservations.length === 0) return null;

  const count = reservations.length;

  return (
    <button
      onClick={() => (panelOpen ? closePanel() : openPanel())}
      className="relative p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('scheduledMessages.title')}
    >
      <ClockIcon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
      <span className="absolute -top-0.5 -end-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-text-link text-text-inverse text-[0.6153rem] font-semibold leading-[14px] text-center">
        {count}
      </span>
    </button>
  );
}
