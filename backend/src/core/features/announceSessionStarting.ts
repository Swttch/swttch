import type { ConnectionManager } from '../../ws/connection-manager';
import { readSessionMarksToShow } from './sessionMarks';
import { noteSentMark } from './sessionMarksKnown';
import { announceSessionsUpdated } from './sessionsUpdated';

/** The id a placeholder row has until the answer to the call names the real session. Never an id the CLI could give. */
export function placeholderSessionId(toolUseId: string): string {
  return `starting:${toolUseId}`;
}

/**
 * Tell the screens a session is being started, before the call that starts it has been answered.
 *
 * The session has no id yet (the program that starts it makes the id and tells it in the answer), but the call
 * already says its name, where it works and, by the session that made the call, whom it was started by. The
 * screens are handed a row made of that under an id of its own, as the desktop app has the session in its list
 * the moment the card is in the conversation. The answer replaces it with the real row (see
 * [announceSessionStarting]) and [dropSessionPlaceholder] takes this one away.
 */
export function announceSessionRequested(
  connections: ConnectionManager,
  requested: { placeholderId: string; cwd: string; title: string; startedBy?: string },
): void {
  const at = new Date().toISOString();
  announceSessionsUpdated(
    connections,
    {
      action: 'create',
      session: {
        sessionId: requested.placeholderId,
        sessionDir: requested.cwd,
        title: requested.title,
        createdAt: at,
        lastTimestamp: at,
        messageCount: null,
        isSidechain: false,
        sessionMark: {
          id: requested.placeholderId,
          parentSessionUid: requested.startedBy ?? null,
          desktopParentSessionId: null,
          handle: null,
          startedAt: Date.now(),
          archivedAt: 0,
          desktopArchived: false,
        },
        provisional: true,
      },
    },
    { sessionDirs: [requested.cwd] },
  );
}

/** Take the placeholder row away: the answer named the real session, or the call failed or was never answered. */
export function dropSessionPlaceholder(connections: ConnectionManager, placeholder: { placeholderId: string; cwd: string }): void {
  announceSessionsUpdated(
    connections,
    { action: 'delete', session: { sessionId: placeholder.placeholderId } },
    { sessionDirs: [placeholder.cwd] },
  );
}

/**
 * Tell the screens a session was started, before its transcript exists.
 *
 * The lists are made of transcripts, and the CLI writes the transcript of a session it was just asked to run
 * a long while after (seconds, and tens of seconds when the machine is busy). The session is in the list the
 * moment it is started, as in the desktop app, so the screens are handed a row made of what is known: where
 * it works, its name, and the mark the package wrote for it (which says who started it). The row says it is
 * `provisional`, which tells a screen that it cannot be opened yet and that a list read before the
 * transcript exists must not take it away.
 *
 * The row the transcript gives replaces it (see announceSessionCreated).
 */
export async function announceSessionStarting(
  connections: ConnectionManager,
  started: { sessionId: string; cwd: string },
  title: string | undefined,
): Promise<void> {
  let mark;
  try {
    mark = (await readSessionMarksToShow()).get(started.sessionId);
  } catch (err) {
    console.error('[node-backend]', 'Failed to read the mark of a started session:', err);
  }
  const startedAt = typeof mark?.row.startedAt === 'number' && mark.row.startedAt > 0 ? mark.row.startedAt : Date.now();
  const at = new Date(startedAt).toISOString();
  const markTitle = typeof mark?.row.title === 'string' ? mark.row.title : '';
  if (mark) noteSentMark(started.sessionId, mark);
  announceSessionsUpdated(
    connections,
    {
      action: 'create',
      session: {
        sessionId: started.sessionId,
        sessionDir: started.cwd,
        title: title ?? markTitle,
        createdAt: at,
        lastTimestamp: at,
        messageCount: null,
        isSidechain: false,
        ...(mark ? { sessionMark: mark.row } : {}),
        provisional: true,
      },
    },
    { sessionDirs: [started.cwd] },
  );
}
