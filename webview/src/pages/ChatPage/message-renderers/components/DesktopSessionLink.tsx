import React, { type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { ClientEnv } from '@/shared';
import { ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { i18n, useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useDesktopSession, type DesktopSession } from '@/hooks/useDesktopSession';
import { timeAgo } from '@/utils/timeAgo';
import { useTranscriptViewMode } from '../transcriptViewMode';

/** A link to a Claude Desktop session as the chat text writes it: `[title](#local_<id>)`. */
const DESKTOP_SESSION_HREF = /^#?(local_[0-9A-Za-z-]+)$/;

/** The Desktop session id a markdown link points at, or undefined when it points anywhere else. */
export function desktopSessionIdOf(href: string | undefined): string | undefined {
  return href ? DESKTOP_SESSION_HREF.exec(href)?.[1] : undefined;
}

/** What the pointer on a session link shows, as in Desktop: whether it is archived, the folder it works in, and when it was last active. */
export const SessionFacts: React.FC<{ session: DesktopSession }> =({ session }) => {
  const { t, i18n: i18nInstance } = useTranslation('chatTools');
  const folder = session.cwd?.split(/[\\/]/).filter(Boolean).pop();
  const ago = session.lastActivityAt !== undefined ? timeAgo(session.lastActivityAt, i18nInstance.language) : undefined;
  if (!session.isArchived && !folder && !ago) return null;
  return (
    <div className="flex items-center gap-3">
      {session.isArchived && (
        <span className="flex shrink-0 items-center gap-1">
          <ArchiveBoxIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t('sessionLink.archived')}
        </span>
      )}
      {folder && <span className="min-w-0 truncate">{folder}</span>}
      {ago && <span className="shrink-0 text-text-primary/50">{ago}</span>}
    </div>
  );
};

/**
 * A mention of a session in the chat text, as Claude Desktop draws it: its name on a blue background. A click
 * opens that session in a new tab. It is a real link (`target="_blank"`). In a browser the link does its own
 * work, which is what puts the session in a new tab. In the IDE the click goes through the adapter, because the
 * popup that target asks for is not reliably handed to the plugin, and `window.open` there is no better (the
 * embedded browser panes turn it into a change of the current tab's address).
 *
 * The session is named in Desktop's id, which this app does not use: Desktop's own file for it says which CLI
 * session it runs and where. Until that is known, or when Desktop's files are not here, it is the name alone on
 * the same background, with nothing to open.
 *
 * `plain` draws it as an underlined link in the text around it, not on the background: a name in a line of a run.
 */
export const DesktopSessionLink: React.FC<{ id: string; children?: ReactNode; plain?: boolean }> = ({ id, children, plain }) => {
  const session = useDesktopSession(id);
  const sessionId = session?.cliSessionId;
  // In the Transcript view the desktop app names the session by its own title, whatever the text called it.
  const inTranscript = useTranscriptViewMode() !== null;
  const name = inTranscript && session?.title ? session.title : children;

  // Nothing to say about the session (no folder, no time, not archived) means no tooltip, rather than an empty one.
  const hasFacts = session !== undefined && (session.isArchived === true || session.cwd !== undefined || session.lastActivityAt !== undefined);
  const chip = (element: React.ReactElement) => (hasFacts ? <Tooltip desktop content={<SessionFacts session={session} />}>{element}</Tooltip> : element);

  if (!sessionId) return chip(<span className={plain ? '' : 'richInputChip'}>{name}</span>);

  const href = `${window.location.origin}/sessions/${sessionId}${session.cwd ? `?workingDir=${encodeURIComponent(session.cwd)}` : ''}`;
  const open = (event: React.MouseEvent) => {
    // Keep the click from also toggling a surrounding container.
    event.stopPropagation();
    const adapter = getAdapter();
    // In a browser the anchor's own `target="_blank"` opens the new tab; nothing to add.
    if (adapter.type === ClientEnv.BROWSER) return;
    event.preventDefault();
    adapter
      .openSession(sessionId, session.cwd)
      .catch((err) => {
        console.error('[DesktopSessionLink] Failed to open session:', err);
        toast.error(i18n.t('chat:chatInput.agentMentionDropdown.openSessionFailed'));
      });
  };

  return chip(
    <a href={href} target="_blank" rel="noreferrer" className={plain ? 'cursor-pointer underline' : 'richInputChip cursor-pointer'} onClick={open}>
      {name}
    </a>,
  );
};
