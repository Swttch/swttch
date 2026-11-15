import type { ConnectionManager } from '../../ws/connection-manager';
import { readSessionMarksToShow } from './sessionMarks';
import { noteSentMark } from './sessionMarksKnown';
import { announceSessionsUpdated } from './sessionsUpdated';

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
