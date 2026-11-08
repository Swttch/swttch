import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { timeAgo } from '@/utils/timeAgo';
import { CopyIcon, ForkIcon } from './footerIcons';

const BUTTON =
  'flex w-6 h-6 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary';

/** A tooltip with a title and, under it, what the button does. */
function Hint({ title, text }: { title: string; text?: string }): ReactNode {
  return (
    <div className="max-w-[16rem] text-start">
      <div className="font-medium">{title}</div>
      {text && <div className="mt-0.5 opacity-70">{text}</div>}
    </div>
  );
}

/**
 * The line under a reply in the Transcript view modes: copy, fork, and how long ago it was sent (the exact time is
 * in the tooltip). It fades in while the pointer is on the reply.
 *
 * This is the Transcript view modes' own line, apart from `MessageFooter` that the classic chat draws, so editing
 * one never changes the other.
 */
export function TranscriptReplyFooter({
  className = '',
  copyText,
  onFork,
  timestamp,
}: {
  className?: string;
  copyText?: string;
  onFork?: () => void;
  timestamp?: string;
}) {
  const { t, i18n } = useTranslation('chat');
  const { confirmDialog, confirm } = useConfirmDialog();
  const sentAt = timestamp ? Date.parse(timestamp) : NaN;
  const known = !Number.isNaN(sentAt);
  const exact = known
    ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(sentAt)
    : '';

  // Asked first, because forking opens a new session and moves the user into it.
  const fork = async () => {
    if (!onFork) return;
    const ok = await confirm({
      title: t('sendActions.forkConfirmTitle'),
      message: t('sendActions.forkConfirmMessage'),
      confirmLabel: t('sendActions.forkConfirmButton'),
    });
    if (ok) onFork();
  };
  const copy = () => {
    if (copyText === undefined) return;
    navigator.clipboard.writeText(copyText).then(
      () => toast.success(t('sendActions.copyDone')),
      () => toast.error(t('sendActions.copyFailed')),
    );
  };

  if (copyText === undefined && !onFork && !known) return null;
  return (
    // The click stops here: the chat logs the raw entry on any click that reaches it. The line is not part of the
    // message, so a copy that reaches over it leaves it out: `select-none` and `data-copy-ignore`.
    <div
      className={`${className} pointer-events-none opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 select-none inline-flex items-center gap-1.5 text-xs text-text-secondary -ms-1`}
      data-copy-ignore="true"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="inline-flex items-center gap-0.5">
        {copyText !== undefined && (
          <Tooltip content={t('transcript.userFooter.copy')} placement="top">
            <button type="button" onClick={copy} aria-label={t('transcript.userFooter.copy')} className={BUTTON}>
              <CopyIcon className="w-[0.95rem] h-[0.95rem]" />
            </button>
          </Tooltip>
        )}
        {onFork && (
          <Tooltip content={<Hint title={t('transcript.userFooter.fork')} text={t('transcript.userFooter.forkHint')} />} placement="top">
            <button type="button" onClick={fork} aria-label={t('transcript.userFooter.fork')} className={BUTTON}>
              <ForkIcon className="w-[0.95rem] h-[0.95rem]" />
            </button>
          </Tooltip>
        )}
      </div>

      {known && (copyText !== undefined || onFork) && <span aria-hidden="true">·</span>}

      {known && (
        <div className="inline-flex items-center gap-0.5">
          <Tooltip content={exact} placement="top">
            <span>{timeAgo(sentAt, i18n.language)}</span>
          </Tooltip>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
