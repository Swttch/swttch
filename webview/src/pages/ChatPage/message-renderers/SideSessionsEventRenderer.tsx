import React, { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

export interface SideSessionsEvent {
  /** What the app told Claude about each session this one started, one note per session. */
  notes: string[];
  /** The standing instruction the app wraps around them. */
  body: string;
}

const REMINDER = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
const EVENT = /<side-sessions-event>([\s\S]*?)(?:<\/side-sessions-event>|$)/;

/** The notes and text of the app's `<side-sessions-event>` entry, or undefined when the text is anything else. */
export function parseSideSessionsEvent(text: string): SideSessionsEvent | undefined {
  const event = EVENT.exec(text.replace(REMINDER, ''));
  if (!event || !/^\s*<side-sessions-event>/.test(text.replace(REMINDER, ''))) return undefined;
  const notes = [...text.matchAll(REMINDER)].map(match => match[1].trim()).filter(Boolean);
  return { notes, body: event[1].trim() };
}

/**
 * The desktop app's note about the sessions this one started: written into the transcript as a user
 * entry so Claude reads it, but nobody sent it. Drawn as one folded line, like another session's
 * message, instead of a bubble holding the app's instructions to Claude word for word.
 */
export const SideSessionsEventRenderer: React.FC<{ event: SideSessionsEvent }> = ({ event }) => {
  const { t } = useTranslation('chatTools');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="pt-2 px-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 max-w-full items-center gap-1.5 text-[0.8461rem] text-text-primary/50 hover:text-text-primary/80"
        >
          <span className="shrink-0">{t('sideSessionsEvent.title')}</span>
          <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open ? (
        <div className="px-4 pt-2 pb-4 space-y-2">
          {[...event.notes, event.body].filter(Boolean).map((block, i) => (
            <div key={i} className="rounded-lg bg-surface-raised px-3 py-2 text-xs leading-relaxed text-text-primary/70 whitespace-pre-wrap break-words">
              {block}
            </div>
          ))}
        </div>
      ) : (
        <div className="pb-4" />
      )}
    </div>
  );
};
