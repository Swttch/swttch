import React, { useMemo, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { ClientEnv } from '@/shared';
import { i18n } from '@/i18n';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { startedSessionsIn, type StartedSession } from '../utils/startedSessions';

/** The address of a session of this app, and how a click on a link to it opens it. */
export function sessionLinkProps(session: StartedSession | undefined): { href?: string; onClick: (event: React.MouseEvent) => void } {
  const href = session
    ? `${window.location.origin}/sessions/${session.sessionId}${session.cwd ? `?workingDir=${encodeURIComponent(session.cwd)}` : ''}`
    : undefined;
  const onClick = (event: React.MouseEvent) => {
    // Keep the click from also toggling a surrounding container.
    event.stopPropagation();
    if (!session) return;
    const adapter = getAdapter();
    // In a browser the anchor's own `target="_blank"` opens the new tab; nothing to add.
    if (adapter.type === ClientEnv.BROWSER) return;
    event.preventDefault();
    adapter.openSession(session.sessionId, session.cwd).catch((err) => {
      console.error('[StartedSessionLink] Failed to open session:', err);
      toast.error(i18n.t('chat:chatInput.agentMentionDropdown.openSessionFailed'));
    });
  };
  return { href, onClick };
}

/** The session this conversation started under that id, or undefined when it started none. */
export function useStartedSession(sessionId: string): StartedSession | undefined {
  const messages = useChatStreamContextOrNull()?.messages;
  // A session started without a folder of its own runs in the folder of the conversation that started it.
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  return useMemo(() => {
    const session = startedSessionsIn(messages).get(sessionId);
    return session && { ...session, cwd: session.cwd ?? workingDirectory };
  }, [messages, sessionId, workingDirectory]);
}

/**
 * A mention of a session this conversation started through the session-management MCP, drawn as the desktop
 * app draws a mention of a session: its name on a blue background, and a click opens that session in a new tab.
 *
 * Where the session runs is known only from the start that this conversation made. A link to any other session
 * is the name alone on the same background, with nothing to open, rather than a link that may lead nowhere.
 *
 * `plain` draws it as an underlined link in the text around it, not on the background: a name in a line of a run.
 */
export const StartedSessionLink: React.FC<{ id: string; children?: ReactNode; plain?: boolean }> = ({ id, children, plain }) => {
  const session = useStartedSession(id);
  if (!session) return <span className={plain ? '' : 'richInputChip'}>{children}</span>;
  const { href, onClick } = sessionLinkProps(session);
  return (
    <a href={href} target="_blank" rel="noreferrer" className={plain ? 'cursor-pointer underline' : 'richInputChip cursor-pointer'} onClick={onClick}>
      {children ?? session.title}
    </a>
  );
};
