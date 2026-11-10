import React, { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

export interface CrossSessionMessage {
  from: string;
  name: string;
  body: string;
}

const WRAPPED = /^\s*<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>\s*$/;

/**
 * A message the session-management MCP (`@swttch/session-manager-mcp`) delivered: plain text whose first line
 * names the sender, `From <title> (session <id>):`. It cannot use the CLI's own tag, which the CLI drops when
 * it is typed in, so this first line is the contract between that server and the screens that draw its messages.
 */
const LABELLED = /^\s*From ([^\n]*?) \(session ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\):\n([\s\S]*)$/i;

function parseLabelled(text: string): CrossSessionMessage | undefined {
  const match = LABELLED.exec(text);
  return match ? { from: match[2], name: match[1].trim(), body: match[3].trim() } : undefined;
}

/** The sender and text of a user entry that is a message from another session, or undefined when it is anything else. */
export function parseCrossSessionMessage(text: string): CrossSessionMessage | undefined {
  // The CLI puts its own status note (a system reminder) ahead of the message; it is not the sender's.
  const typed = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  const match = WRAPPED.exec(typed);
  if (!match) return parseLabelled(typed);
  const attribute = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(match[1])?.[1] ?? '';
  return { from: attribute('from'), name: attribute('name'), body: match[2].trim() };
}

const PREVIEW_WRAPPED = /^\s*<cross-session-message\b([^>]*)>([\s\S]*?)(?:<\/cross-session-message>)?\s*$/;

/**
 * The same, for the cut copy the session index keeps of a send (the rail's card, the carried header): the
 * closing tag may have been cut off with the rest of the text.
 */
export function parseCrossSessionPreview(text: string): CrossSessionMessage | undefined {
  const match = PREVIEW_WRAPPED.exec(text);
  if (!match) return parseLabelled(text);
  const attribute = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(match[1])?.[1] ?? '';
  return { from: attribute('from'), name: attribute('name'), body: match[2].trim() };
}

/**
 * A message another Claude session sent this one, which the CLI records as a user entry wrapped in a
 * `<cross-session-message>` tag. Claude Desktop shows it as one folded line, "message received from the
 * following sender", with the sender's name. Opening the line shows the text in the ordinary user bubble,
 * the one the entry itself would have had, so it keeps what that bubble does (fold, copy, rewind) (#593).
 */
export const CrossSessionMessageRenderer: React.FC<{
  message: CrossSessionMessage;
  /** Draws the message's text as the entry itself would be drawn, with its bubble and all that comes with it. */
  renderBody: (body: string) => ReactNode;
}> = ({ message, renderBody }) => {
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
          <span className="shrink-0">{t('crossSessionMessage.title')}</span>
          {message.name && <span className="min-w-0 truncate rounded bg-surface-raised px-1.5 py-0.5 text-text-primary/70">{message.name}</span>}
          <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open ? renderBody(message.body) : <div className="pb-4" />}
    </div>
  );
};
