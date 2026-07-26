import { useEffect, useRef } from 'react';
import { PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { ScheduledMessageKind, type ScheduledMessage } from '@/shared';
import { useTranslation } from '@/i18n';
import { ScheduleSendPopover } from '../ChatInput/ScheduleSendPopover';

/** Format an ISO sendAt for display in the panel (locale-aware, no seconds). */
function formatSendAt(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReservationRow({ reservation }: { reservation: ScheduledMessage }) {
  const { t } = useTranslation('chat');
  const { cancel, startEdit } = useScheduledMessages();
  // Auto-resume reservations are managed by the limit banner, not hand-editable;
  // still listed (read-only) so the user sees everything pending on the session.
  const isAutoResume = reservation.kind === ScheduledMessageKind.AUTO_RESUME;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2.5">
      <div className="text-text-primary text-[0.9230rem] break-words line-clamp-3 whitespace-pre-wrap">
        {reservation.message}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[0.8461rem] text-text-tertiary">{formatSendAt(reservation.sendAt)}</span>
        <div className="flex items-center gap-1 shrink-0">
          {!isAutoResume && (
            <button
              onClick={() => startEdit(reservation)}
              className="p-1 rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              title={t('scheduledMessages.edit')}
            >
              <PencilSquareIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => cancel(reservation.id)}
            className="p-1 rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-state-error-fg"
            title={t('scheduledMessages.cancel')}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Slide-in panel listing the current session's scheduled messages (reservations).
 * Mirrors BackgroundTasksPanel's shell; each row offers Edit (opens the
 * ScheduleSendPopover in edit mode via the context's editing state) and Cancel.
 */
export function ScheduledMessagesPanel() {
  const { t } = useTranslation('chat');
  const { reservations, panelOpen, closePanel } = useScheduledMessages();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the panel on open so Escape acts on it; restore on close.
  useEffect(() => {
    if (!panelOpen) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prevFocus?.focus?.();
  }, [panelOpen]);

  if (!panelOpen) return null;

  return (
    <Portal>
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            closePanel();
          }
        }}
        className="fixed end-0 top-0 bottom-0 w-[24rem] max-w-[92vw] z-40 flex flex-col bg-surface-raised border-s border-border-default shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between px-4 h-[44px] border-b border-border-subtle shrink-0">
          <div className="text-text-primary text-[1rem] font-semibold">
            {t('scheduledMessages.title')}
          </div>
          <button
            onClick={closePanel}
            className="p-1 rounded hover:bg-surface-hover transition-colors"
            title={t('scheduledMessages.close')}
          >
            <XMarkIcon className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {reservations.length === 0 ? (
            <div className="text-text-primary/50 text-[0.9230rem] text-center mt-8">
              {t('scheduledMessages.empty')}
            </div>
          ) : (
            reservations.map((r) => <ReservationRow key={r.id} reservation={r} />)
          )}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Edit overlay: when a reservation is selected for editing (from a panel row's
 * Edit button), render the ScheduleSendPopover in edit mode as a centered modal.
 * Mounted alongside the panel so editing works whether the panel is open or not.
 */
export function ScheduledMessageEditOverlay() {
  const { editing, stopEdit } = useScheduledMessages();
  if (!editing) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-[36rem] max-w-full">
          <ScheduleSendPopover editReservation={editing} onClose={stopEdit} />
        </div>
      </div>
    </Portal>
  );
}
