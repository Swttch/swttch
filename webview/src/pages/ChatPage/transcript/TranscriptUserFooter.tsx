import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { ArrowUturnLeftIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { timeAgo } from '@/utils/timeAgo';
import { CopyIcon, ForkIcon } from './footerIcons';

const BUTTON =
  'flex w-6 h-6 cursor-pointer items-center justify-center rounded-md text-[#9c9c9c] transition-colors hover:bg-surface-hover hover:text-[#efefef]';

/** A tooltip with a title and, under it, what the button does. */
function Hint({ title, text }: { title: string; text?: string }): ReactNode {
  return (
    <div className="max-w-[16rem] text-start">
      <div className="font-medium">{title}</div>
      {text && <div className="mt-0.5 opacity-70">{text}</div>}
    </div>
  );
}

/** Two ticks, the mark a message has been read. */
function ReadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M1.5 10.5l3.5 3.5 7-8" />
      <path d="M8.5 13.5l.5.5 7-8" />
    </svg>
  );
}

/**
 * The line under a send in the Transcript view modes, as the desktop app draws it: a mark that Claude read the
 * message, how long ago it was sent (the exact time is in the tooltip), and copy, rewind and fork, each with a tooltip
 * that says what it does. It fades in while the pointer is on the send.
 */
export function TranscriptUserFooter({
  copyText,
  onRewind,
  onFork,
  timestamp,
}: {
  copyText?: string;
  onRewind?: () => void;
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

  if (copyText === undefined && !onFork && !onRewind && !known) return null;
  return (
    <div
      className={`pointer-events-none opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 inline-flex select-none items-center gap-1.5 text-xs text-text-secondary -me-1`}
      data-copy-ignore="true"
      onClick={(event) => event.stopPropagation()}
    >
      {known && (
        <div className="inline-flex items-center gap-0.5">
          <Tooltip content={t('transcript.userFooter.read')} placement="top">
            <span className="flex h-[22px] w-5 items-center justify-center">
              <ReadIcon className="h-[14px] w-[14px]" />
            </span>
          </Tooltip>
          <Tooltip content={exact} placement="top">
            <span className="">{timeAgo(sentAt, i18n.language)}</span>
          </Tooltip>
        </div>
      )}
      {known && (copyText !== undefined || onRewind || onFork) && <span aria-hidden="true">·</span>}

      <div className="inline-flex items-center gap-0.5">
        {copyText !== undefined && (
          <Tooltip content={t('transcript.userFooter.copy')} placement="top">
            <button type="button" onClick={copy} aria-label={t('transcript.userFooter.copy')} className={BUTTON}>
              <CopyIcon className="w-[0.95rem] h-[0.95rem]" />
            </button>
          </Tooltip>
        )}
        {onRewind && (
          <Tooltip content={<Hint title={t('transcript.userFooter.rewind')} text={t('transcript.userFooter.rewindHint')} />} placement="top">
            <button type="button" onClick={onRewind} aria-label={t('transcript.userFooter.rewind')} className={BUTTON}>
              <ArrowUturnLeftIcon className="w-[0.95rem] h-[0.95rem]" />
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
      {confirmDialog}
    </div>
  );
}
