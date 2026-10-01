import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { formatMessageTimestamp } from '@/utils/time';
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
}

/*
  Both glyphs are drawn after the ones under a reply in the Claude app, so the
  line reads the same to someone arriving from there: two stacked rounded
  squares for copy, and for fork a line that turns up and away from a second
  arrow heading down.
*/
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.5 5V4.5A1.5 1.5 0 0 1 9 3h6.5A1.5 1.5 0 0 1 17 4.5V11a1.5 1.5 0 0 1-1.5 1.5H15" />
      <rect x="3" y="7.5" width="9.5" height="9.5" rx="1.5" />
    </svg>
  );
}

function ForkIcon({ className }: { className?: string }) {
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

export function MessageFooter({ className = '', copyText, onFork, timestamp, expanded = false, alwaysDisplay = false }: MessageFooterProps) {
  const { t, i18n } = useTranslation('chat');
  const time = timestamp ? formatMessageTimestamp(timestamp, i18n.language) : '';
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
    <div
      className={`${className} ${folded ? (expanded ? '' : 'hidden') : (alwaysDisplay ? '' : 'invisible group-hover:visible')} transition-all inline-flex items-center gap-1 text-xs text-text-secondary mt-2`}
      onClick={e => e.stopPropagation()}
    >
      {copyText !== undefined && (
        <Tooltip content={t('sendActions.copyMessage')} placement="top">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t('sendActions.copyMessage')}
            className={buttonClass}
          >
            <CopyIcon className="w-4 h-4" />
          </button>
        </Tooltip>
      )}

      {onFork && (
        <Tooltip content={t('sendActions.forkConversation')} placement="top">
          <button
            type="button"
            onClick={handleFork}
            aria-label={t('sendActions.forkConversation')}
            className={buttonClass}
          >
            <ForkIcon className="w-4 h-4" />
          </button>
        </Tooltip>
      )}

      {time && <span className="px-1">{time}</span>}

      {confirmDialog}
    </div>
  );
}
