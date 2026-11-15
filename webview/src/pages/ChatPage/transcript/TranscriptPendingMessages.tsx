import toast from 'react-hot-toast';
import { ArrowUturnLeftIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useChatStreamContext, type SentWhileRunning } from '@/contexts/ChatStreamContext';
import { USER_BUBBLE_CLASS } from './userBubble';
import { CopyIcon, ForkIcon } from './footerIcons';

const ICON_BUTTON =
  'flex w-6 h-6 items-center justify-center rounded-md text-[var(--tr-muted)] transition-colors enabled:cursor-pointer enabled:hover:bg-surface-hover enabled:hover:text-[var(--tr-text)] disabled:opacity-50';

/**
 * The icons under a message the CLI has not read yet, as the desktop app draws them: copy, rewind and fork (which have
 * nothing to act on before the message is read, so they stand dimmed) and a cross that takes the message back to the
 * message box. They show while the pointer is on the message.
 */
function WaitingActions({ content, onCancel }: { content: string; onCancel?: () => void }) {
  const { t } = useTranslation('chat');
  const copy = () => {
    navigator.clipboard.writeText(content).then(
      () => toast.success(t('sendActions.copyDone')),
      () => toast.error(t('sendActions.copyFailed')),
    );
  };
  return (
    <div
      className="pointer-events-none inline-flex select-none items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      data-copy-ignore="true"
    >
      <Tooltip content={t('transcript.userFooter.copy')} placement="top">
        <button type="button" onClick={copy} aria-label={t('transcript.userFooter.copy')} className={ICON_BUTTON}>
          <CopyIcon className="w-[0.95rem] h-[0.95rem]" />
        </button>
      </Tooltip>
      <Tooltip content={t('transcript.userFooter.rewind')} placement="top">
        <button type="button" disabled aria-label={t('transcript.userFooter.rewind')} className={ICON_BUTTON}>
          <ArrowUturnLeftIcon className="w-[0.95rem] h-[0.95rem]" />
        </button>
      </Tooltip>
      <Tooltip content={t('transcript.userFooter.fork')} placement="top">
        <button type="button" disabled aria-label={t('transcript.userFooter.fork')} className={ICON_BUTTON}>
          <ForkIcon className="w-[0.95rem] h-[0.95rem]" />
        </button>
      </Tooltip>
      {onCancel && (
        <Tooltip content={t('chatPage.cancelHeld')} placement="top">
          <button type="button" onClick={onCancel} aria-label={t('chatPage.cancelHeld')} data-testid="pending-message-cancel" className={ICON_BUTTON}>
            <XMarkIcon className="w-[1.1rem] h-[1.1rem]" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The messages written while a turn runs, which the CLI has not read yet, drawn in the conversation as the desktop
 * app draws them: an ordinary message bubble and, under it, the icons and a cross that takes the message back. They
 * stand above the line saying what is being done. The CLI already has them in its queue (see
 * ChatStreamContext.sentWhileRunning) and reads each where its step ends, so there is no "Send now" here: the only way
 * to make it read one sooner is to stop the step that is running, which is not what a message sent in is for. When the
 * CLI reads one, the bubble enters the chat where the CLI read it.
 */
export function TranscriptPendingMessages() {
  const { sentWhileRunning = [], cancelPendingMessage, pendingCancelSupported } = useChatStreamContext();
  if (sentWhileRunning.length === 0) return null;
  return (
    <div className="mt-[2.0187rem]" data-transcript-pending>
      {sentWhileRunning.map((sent: SentWhileRunning) => (
        <div key={sent.id} className="group flex flex-col items-end gap-1.5 pt-2 px-4 pb-[1.5875rem]" data-pending-sent-message>
          <div className={USER_BUBBLE_CLASS}>
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{sent.content}</div>
          </div>
          <div className="mt-[0.5437rem] flex items-center gap-1">
            <WaitingActions content={sent.content} onCancel={pendingCancelSupported ? () => cancelPendingMessage(sent.id) : undefined} />
          </div>
        </div>
      ))}
    </div>
  );
}
