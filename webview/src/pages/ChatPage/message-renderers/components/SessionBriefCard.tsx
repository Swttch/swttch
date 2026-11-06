import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { useSessionParentTitle } from '@/hooks/useSessionParentTitle';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { useScrollFoldValue } from '../../ScrollFoldContext';
import { FOLD_MIN_HEIGHT } from '../../useScrollFold';
import type { SessionBrief } from '../utils/sessionBrief';
import { MessageFooter } from './MessageFooter';
import { UserMessageText } from './UserMessageText';

/** The height a card's text is cut at until "Show more" is pressed (9em in Desktop). */
const CLAMPED = 'max-h-[9em] overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%_-_2rem),transparent)]';

/**
 * One card of the brief. `meta` is the dim title beside its label. `unclamped` is the whole box having been
 * opened by a click: then the text shows in full and the card's own "Show more" has nothing left to do.
 */
const BriefStep: React.FC<{ label: string; text: string; meta?: string; unclamped: boolean }> = ({ label, text, meta, unclamped }) => {
  const { t } = useTranslation('chatTools');
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const full = expanded || unclamped;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Whether the text is taller than the cut, read while it is cut: once expanded the height no longer says.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && !full) setOverflowing(body.scrollHeight > body.clientHeight + 1);
  }, [text, open, full]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit max-w-full items-center gap-1 text-[0.8461rem] text-text-primary/50 hover:text-text-primary/80"
      >
        <span>{label}</span>
        {meta && <span className="min-w-0 truncate rounded bg-surface-raised px-1.5 text-text-primary/70">{meta}</span>}
        <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <>
          <div
            ref={bodyRef}
            data-testid="session-brief-text"
            className={`whitespace-pre-wrap break-words text-[1rem] leading-[1.5] text-text-primary/80 ${full ? '' : CLAMPED}`}
          >
            <UserMessageText text={text} />
          </div>
          <div className="flex items-center gap-2">
            {!unclamped && (overflowing || expanded) && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="w-fit text-[0.8461rem] text-text-primary/50 hover:text-text-primary/80"
              >
                {expanded ? t('sessionBrief.showLess') : t('sessionBrief.showMore')}
              </button>
            )}
            <MessageFooter copyText={text} />
          </div>
        </>
      )}
    </div>
  );
};

/**
 * The first message of a session another session started, as in Claude Desktop: a line saying so, and under it
 * a "Task" card and a "Context" card, each with its own fold and a "Show more" for long text. The line names the
 * session that started this one when Desktop's own session files say which it was; the transcript does not.
 */
export const SessionBriefCard: React.FC<{ brief: SessionBrief }> = ({ brief }) => {
  const { t } = useTranslation('chatTools');
  const [open, setOpen] = useState(true);
  // A click on the box opens it to the height an expanded send bubble has, and another click closes it again.
  const [expanded, setExpanded] = useState(false);
  const parentTitle = useSessionParentTitle(true);
  // The Task card carries the title of this session, as in Desktop.
  const sessionTitle = useSessionContextOrNull()?.currentSession?.title || undefined;
  // While this send is pinned to the top, scrolling the reply past it rolls the cards up the way an ordinary
  // send's bubble rolls up: the same height, read from the same place (`useScrollFold` finds `data-message-box`).
  const fold = useScrollFoldValue();
  const folding = fold !== null && !expanded;
  const height = fold ? Math.min(Math.max(fold.height, FOLD_MIN_HEIGHT), fold.restingHeight) : undefined;
  return (
    // `group` is what the copy line under each card waits on to show itself on hover.
    <div className={`group flex flex-col gap-2 px-4 ${fold ? 'pt-2 pb-4' : 'py-2'}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit max-w-full items-center gap-1.5 text-[0.8461rem] text-text-primary/50 hover:text-text-primary/80"
      >
        <span className="min-w-0 truncate">
          {parentTitle ? (
            <>
              {t('sessionBrief.fromNamed')} <bdi className="text-text-primary/70">{parentTitle}</bdi>
            </>
          ) : (
            t('sessionBrief.from')
          )}
        </span>
        <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div
          data-message-box
          className={`flex flex-col gap-3 rounded-lg border border-border-default bg-surface-hover px-3 py-2 ${
            expanded ? 'max-h-[80vh] overflow-y-auto overscroll-contain' : folding ? 'overflow-hidden' : ''
          }`}
          style={folding ? { height } : undefined}
          onClick={(event) => {
            // A button or link has its own click, and a selection being made is not a request to open the box.
            if ((event.target as HTMLElement).closest('button, a')) return;
            if (window.getSelection()?.toString()) return;
            setExpanded((value) => !value);
          }}
        >
          <BriefStep label={t('sessionBrief.task')} text={brief.task} meta={sessionTitle} unclamped={expanded} />
          <BriefStep label={t('sessionBrief.context')} text={brief.context} unclamped={expanded} />
        </div>
      )}
    </div>
  );
};
