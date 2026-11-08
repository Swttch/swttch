import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { formatMessageTimestamp } from '@/utils/time';
import { timeAgo } from '@/utils/timeAgo';
import { useScrollFoldValue } from '../../ScrollFoldContext';

/**
 * The line under a message: copy, fork, and the time it was sent (issue #498).
 *
 * Each of the three is drawn only when its prop is given, so every place that
 * mounts this line decides for itself which of them apply there. A message the
 * CLI has not recorded yet cannot be forked, for one — the caller leaves
 * `onFork` out, and the slot is simply not there.
 */
interface MessageFooterProps {
  className?: string;

  /** Text the copy button writes to the clipboard. Omit to hide the button. */
  copyText?: string;
  /** Called by the fork button. Omit to hide the button. */
  onFork?: () => void;
  /**
   * The entry's own `timestamp`, as the CLI recorded it. Omit to hide the time;
   * an absent or unparseable value hides it too.
   */
  timestamp?: string;
  /**
   * Whether the bubble above has been expanded by a click. Only matters while
   * the send is pinned and folded: the footer is gone then, and comes back
   * with the expanded bubble.
   */
  expanded?: boolean;
  /**
   * Show the footer without waiting for a hover. Set on whatever the chat ends
   * on, so the latest exchange always has its copy button and time in view.
   * A pinned, folded send still drops it — folding outranks this.
   */
  alwaysDisplay?: boolean;
  /**
   * Say how long ago the message was sent ("2 hours ago") and show the exact time in a tooltip on the pointer,
   * instead of writing the weekday and the time. The Transcript view modes set it.
   */
  relativeTime?: boolean;
}

/*
  Both glyphs are drawn after the ones under a reply in the Claude app, so the
  line reads the same to someone arriving from there: two stacked rounded
  squares for copy, and for fork a line that turns up and away from a second
  arrow heading down.
*/
export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.5 5V4.5A1.5 1.5 0 0 1 9 3h6.5A1.5 1.5 0 0 1 17 4.5V11a1.5 1.5 0 0 1-1.5 1.5H15" />
      <rect x="3" y="7.5" width="9.5" height="9.5" rx="1.5" />
    </svg>
  );
}

export function ForkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10h6.5L17 3" />
      <path d="M12 3h5v5" />
      <path d="M12 12l4.5 4.5" />
      <path d="M17 12v5h-5" />
    </svg>
  );
}

const buttonClass =
  'flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer';

/** The same, a size larger: what `relativeTime` (the Transcript view modes) draws. */
const largeButtonClass =
  'flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer';

export function MessageFooter({ className = '', copyText, onFork, timestamp, expanded = false, alwaysDisplay = false, relativeTime = false }: MessageFooterProps) {
  const { t, i18n } = useTranslation('chat');
  const sentAt = timestamp ? Date.parse(timestamp) : NaN;
  const time = timestamp
    ? relativeTime && !Number.isNaN(sentAt)
      ? timeAgo(sentAt, i18n.language)
      : formatMessageTimestamp(timestamp, i18n.language)
    : '';
  const exactTime =
    relativeTime && !Number.isNaN(sentAt)
      ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(sentAt)
      : '';
  // Set while the send is pinned to the top and folded by the scroll. The
  // footer is taken out entirely then, even under the pointer: the pinned
  // bubble is a signpost for the reply below it, not the message to act on.
  //
  // Expanding that bubble by a click is the user asking to read it after all,
  // so the footer comes back with it, and stays shown rather than waiting for
  // a hover: the click already said where the attention is.
  const folded = useScrollFoldValue() !== null;
  const { confirmDialog, confirm } = useConfirmDialog();

  if (copyText === undefined && !onFork && !time) return null;

  // Asked first, because forking opens a new session and moves the user into
  // it. A button that sits under every message, one pointer move away from
  // copy, is too easy to press by accident for that to happen on one click.
  const handleFork = async () => {
    if (!onFork) return;
    const ok = await confirm({
      title: t('sendActions.forkConfirmTitle'),
      message: t('sendActions.forkConfirmMessage'),
      confirmLabel: t('sendActions.forkConfirmButton'),
    });
    if (ok) onFork();
  };

  // Same feedback as the copy entry in `SendActionMenu`: a failed clipboard
  // write is reported, since the user would otherwise paste something else.
  const handleCopy = () => {
    if (copyText === undefined) return;
    navigator.clipboard.writeText(copyText).then(
      () => toast.success(t('sendActions.copyDone')),
      () => toast.error(t('sendActions.copyFailed')),
    );
  };

  return (
    // The click stops here: `ChatMessageArea` logs the raw entry on any click
    // that reaches it, which is not what pressing one of these buttons asked for.
    //
    // The line is not part of the message, so a copy that reaches over it leaves it out (#648):
    // `select-none` for the selected text, `data-copy-ignore` for the HTML built from the page.
    <div
      className={`${className} ${folded ? (expanded ? '' : 'hidden') : (alwaysDisplay ? '' : 'invisible group-hover:visible')} select-none transition-all inline-flex items-center gap-1 ${relativeTime ? 'text-sm' : 'text-xs'} text-text-secondary -top-0.5`}
      data-copy-ignore="true"
      onClick={e => e.stopPropagation()}
    >
      {copyText !== undefined && (
        <Tooltip content={relativeTime ? t('transcript.userFooter.copy') : t('sendActions.copyMessage')} placement="top">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={relativeTime ? t('transcript.userFooter.copy') : t('sendActions.copyMessage')}
            className={relativeTime ? largeButtonClass : buttonClass}
          >
            <CopyIcon className={relativeTime ? 'w-4 h-4' : 'w-4 h-4'} />
          </button>
        </Tooltip>
      )}

      {onFork && (
        <Tooltip
          content={
            relativeTime ? (
              <div className="max-w-[16rem] text-start">
                <div className="font-medium">{t('transcript.userFooter.fork')}</div>
                <div className="mt-0.5 opacity-70">{t('transcript.userFooter.forkHint')}</div>
              </div>
            ) : (
              t('sendActions.forkConversation')
            )
          }
          placement="top"
        >
          <button
            type="button"
            onClick={handleFork}
            aria-label={relativeTime ? t('transcript.userFooter.fork') : t('sendActions.forkConversation')}
            className={relativeTime ? largeButtonClass : buttonClass}
          >
            <ForkIcon className={relativeTime ? 'w-4 h-4' : 'w-4 h-4'} />
          </button>
        </Tooltip>
      )}

      {time && relativeTime && (copyText !== undefined || onFork) && <span aria-hidden="true">·</span>}
      {time && (exactTime ? <Tooltip content={exactTime} placement="top"><span className="px-1.5">{time}</span></Tooltip> : <span className="px-1">{time}</span>)}

      {confirmDialog}
    </div>
  );
}
