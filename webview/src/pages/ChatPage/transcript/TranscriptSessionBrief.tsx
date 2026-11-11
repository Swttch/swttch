import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { useSessionParent } from '@/hooks/useSessionParent';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { timeAgo } from '@/utils/timeAgo';
import type { LoadedMessageDto } from '../../../types';
import type { SessionBrief } from '../message-renderers/utils/sessionBrief';
import { UserMessageText } from '../message-renderers/components/UserMessageText';
import { openSessionFromClick, sessionLinkHref } from '../message-renderers/components/DesktopSessionLink';
import './prose.css';

const QUIET_TEXT = 'text-[var(--tr-muted)]';

/** The height a card's text is cut at until "Show more" is pressed. */
const CLAMPED = 'max-h-[9em] overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%_-_2rem),transparent)]';

/**
 * One card of the brief: its label (with the session's title beside the Task card), what it says, and a "Show more"
 * when the text is taller than the cut. The Task card starts open and the Context card shut.
 */
function BriefStep({ label, text, meta, defaultOpen }: { label: string; text: string; meta?: string; defaultOpen: boolean }) {
  const { t } = useTranslation('chatTools');
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Whether the text is taller than the cut, read while it is cut: once expanded the height no longer says.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && !expanded) setOverflowing(body.scrollHeight > body.clientHeight + 1);
  }, [text, open, expanded]);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-fit max-w-full items-center gap-1.5 text-[0.9375rem] hover:text-[var(--tr-hover)] ${QUIET_TEXT}`}
      >
        {/* The label stays on one line and keeps its width: a narrow window shortens the title beside it
            (which ends in an ellipsis) instead of pushing the label onto several lines. */}
        <span className="shrink-0 whitespace-nowrap">{label}</span>
        {meta && <span className="min-w-0 truncate text-[var(--tr-text)]">{meta}</span>}
        {open ? <ChevronDownIcon className="h-4 w-4 shrink-0" /> : <ChevronRightIcon className="h-4 w-4 shrink-0" />}
      </button>
      {open && (
        <>
          <div
            ref={bodyRef}
            data-testid="session-brief-text"
            className={`transcript-prose whitespace-pre-wrap break-words text-[1rem] leading-[1.5] text-[var(--tr-soft)] ${expanded ? '' : CLAMPED}`}
          >
            <UserMessageText text={text} />
          </div>
          {(overflowing || expanded) && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className={`w-fit text-[0.8461rem] hover:text-[var(--tr-hover)] ${QUIET_TEXT}`}>
              {expanded ? t('sessionBrief.showLess') : t('sessionBrief.showMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The first message of a session another session started, as the desktop app's Transcript view draws it: a quiet
 * line over the card ("Started by Claude from {session}, 15 hours ago · Archived"), and in the card a Task
 * and a Context step. The Context step is shut until it is opened.
 */
export function TranscriptSessionBrief({ brief, message }: { brief: SessionBrief; message: LoadedMessageDto }) {
  const { t, i18n } = useTranslation('chat');
  const [open, setOpen] = useState(true);
  const parent = useSessionParent(true);
  const sessionTitle = useSessionContextOrNull()?.currentSession?.title || undefined;
  const sent = message.timestamp ? Date.parse(message.timestamp) : NaN;
  const ago = Number.isNaN(sent) ? undefined : timeAgo(sent, i18n.language);
  const toggle = () => setOpen((value) => !value);

  return (
    <div className="flex flex-col gap-2 px-4 py-2" data-transcript-brief>
      <div className={`flex w-fit max-w-full items-center gap-1.5 text-[0.9375rem] ${QUIET_TEXT}`}>
        {/* The starter's title is a link to it, so it cannot sit inside the button that folds the cards: the line is the
            words before it, the link, and the rest, the two button parts both folding the cards. */}
        <button type="button" aria-expanded={open} onClick={toggle} className="min-w-0 truncate text-start hover:text-[var(--tr-hover)]">
          {parent?.title ? t('transcript.tools.startedByClaudeFrom') : t('transcript.tools.startedByClaude')}
        </button>
        {parent?.title &&
          (parent.sessionId ? (
            <a
              href={sessionLinkHref(parent.sessionId, parent.dir)}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => openSessionFromClick(event, parent.sessionId!, parent.dir)}
              className="min-w-0 cursor-pointer truncate text-[var(--tr-text)] underline underline-offset-2 hover:text-[var(--tr-hover)]"
            >
              <bdi>{parent.title}</bdi>
            </a>
          ) : (
            <bdi className="min-w-0 truncate text-[var(--tr-text)] underline underline-offset-2">{parent.title}</bdi>
          ))}
        <button type="button" aria-expanded={open} onClick={toggle} tabIndex={-1} className="flex shrink-0 items-center gap-1.5 hover:text-[var(--tr-hover)]">
          {ago && <span>{ago}</span>}
          {parent?.isArchived && <span>· {i18n.t('sessionLink.archived', { ns: 'chatTools' })}</span>}
          {open ? <ChevronDownIcon className="h-4 w-4 shrink-0" /> : <ChevronRightIcon className="h-4 w-4 shrink-0" />}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-default/70 bg-surface-hover px-3.5 py-3">
          <BriefStep label={i18n.t('sessionBrief.task', { ns: 'chatTools' })} text={brief.task} meta={sessionTitle} defaultOpen />
          <BriefStep label={i18n.t('sessionBrief.context', { ns: 'chatTools' })} text={brief.context} defaultOpen={false} />
        </div>
      )}
    </div>
  );
}
