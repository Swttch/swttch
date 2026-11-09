import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { timeAgo } from '@/utils/timeAgo';
import { useReadAloud } from '@/hooks/useReadAloud';
import { speakableText } from '@/utils/readAloud/speakableText';
import { CopyIcon, ForkIcon, PauseIcon, PlayIcon, SpeakerIcon } from './footerIcons';

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
  readAloudKey,
}: {
  className?: string;
  /** Names this reply for "Read aloud", which reads `copyText`. Without it the button is not drawn. */
  readAloudKey?: string;
  copyText?: string;
  onFork?: () => void;
  timestamp?: string;
}) {
  const { t, i18n } = useTranslation('chat');
  const { confirmDialog, confirm } = useConfirmDialog();
  const reading = useReadAloud(readAloudKey ?? '');
  const canRead = readAloudKey !== undefined && copyText !== undefined && copyText.trim() !== '';
  const readLabel =
    reading.status === 'loading' ? t('readAloud.loading')
    : reading.status === 'playing' ? t('readAloud.pause')
    : reading.status === 'paused' ? t('readAloud.resume')
    : t('readAloud.label');
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
  // While it is being read the line stays on screen, so the pause button does not vanish with the pointer.
  const visible = reading.status === 'idle' ? 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100' : 'opacity-100';
  return (
    // The click stops here: the chat logs the raw entry on any click that reaches it. The line is not part of the
    // message, so a copy that reaches over it leaves it out: `select-none` and `data-copy-ignore`.
    <div
      className={`${className} ${visible} transition-opacity duration-150 select-none inline-flex items-center gap-1.5 text-xs text-text-secondary -ms-1`}
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
        {canRead && (
          <Tooltip content={readLabel} placement="top">
            <button
              type="button"
              onClick={() => reading.toggle(speakableText(copyText ?? '', t('readAloud.codeBlock')))}
              aria-label={readLabel}
              className={BUTTON}
            >
              {reading.status === 'loading' ? (
                <span className="h-[0.95rem] w-[0.95rem] animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
              ) : reading.status === 'playing' ? (
                <PauseIcon className="w-[0.95rem] h-[0.95rem]" />
              ) : reading.status === 'paused' ? (
                <PlayIcon className="w-[0.95rem] h-[0.95rem]" />
              ) : (
                <SpeakerIcon className="w-[0.95rem] h-[0.95rem]" />
              )}
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
