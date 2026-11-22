import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { useReadAloud } from '@/hooks/useReadAloud';
import { speakableText } from '@/utils/readAloud/speakableText';
import { SpeakerWaveIcon } from '@heroicons/react/24/outline';
import { CopyIcon, ForkIcon, PauseIcon, PlayIcon } from './footerIcons';

const BUTTON =
  'flex w-[1.35rem] h-[1.35rem] cursor-pointer items-center justify-center rounded-[0.3376rem] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary';

/** A tooltip with a title and, under it, what the button does. */
function Hint({ title, text }: { title: string; text?: string }): ReactNode {
  return (
    <div className="max-w-[14.4rem] text-start">
      <div className="font-medium">{title}</div>
      {text && <div className="mt-[0.1126rem] opacity-70">{text}</div>}
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
  shown = false,
}: {
  /** Stays on screen without the pointer, for a line that stands under something opened. */
  shown?: boolean;
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
  const ago = useTimeAgo(known ? sentAt : undefined, i18n.language);
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
  const visible = reading.status === 'idle' && !shown ? 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100' : 'opacity-100';
  return (
    // The click stops here: the chat logs the raw entry on any click that reaches it. The line is not part of the
    // message, so a copy that reaches over it leaves it out: `select-none` and `data-copy-ignore`.
    <div
      className={`${className} ${visible} transition-opacity duration-150 select-none inline-flex items-center gap-[0.3376rem] text-[0.75rem] leading-[1rem] text-text-secondary -ms-[0.225rem]`}
      data-copy-ignore="true"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="inline-flex items-center gap-[0.1126rem]">
        {copyText !== undefined && (
          <Tooltip content={t('transcript.userFooter.copy')} placement="top">
            <button type="button" onClick={copy} aria-label={t('transcript.userFooter.copy')} className={BUTTON}>
              <CopyIcon className="w-[0.855rem] h-[0.855rem]" />
            </button>
          </Tooltip>
        )}
        {onFork && (
          <Tooltip content={<Hint title={t('transcript.userFooter.fork')} text={t('transcript.userFooter.forkHint')} />} placement="top">
            <button type="button" onClick={fork} aria-label={t('transcript.userFooter.fork')} className={BUTTON}>
              <ForkIcon className="w-[0.855rem] h-[0.855rem]" />
            </button>
          </Tooltip>
        )}
        {/* Read aloud stands last, after copy and fork, as the desktop app orders them. Its speaker is Heroicons' (the
            project's icon library), 16px in its box so that the glyph, stroke included, is about the 14 x 12px the desktop app draws. */}
        {canRead && (
          <Tooltip content={readLabel} placement="top">
            <button
              type="button"
              onClick={() => reading.toggle(speakableText(copyText ?? '', t('readAloud.codeBlock')))}
              aria-label={readLabel}
              className={BUTTON}
            >
              {reading.status === 'loading' ? (
                <span className="h-[0.855rem] w-[0.855rem] animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
              ) : reading.status === 'playing' ? (
                <PauseIcon className="w-[0.855rem] h-[0.855rem]" />
              ) : reading.status === 'paused' ? (
                <PlayIcon className="w-[0.855rem] h-[0.855rem]" />
              ) : (
                <SpeakerWaveIcon className="w-[1rem] h-[1rem]" />
              )}
            </button>
          </Tooltip>
        )}
      </div>

      {/* The desktop app has no dot between the icons and the time, only the room one takes: measured on its recording
          (the time starts about 14px after the last icon). The room is kept, the dot is not drawn. */}
      {known && (copyText !== undefined || onFork) && <span aria-hidden="true" className="invisible" data-testid="reply-footer-gap">·</span>}

      {known && (
        <div className="inline-flex items-center gap-[0.1126rem]">
          <Tooltip content={exact} placement="top">
            <span>{ago}</span>
          </Tooltip>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
