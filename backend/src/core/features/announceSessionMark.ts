import type { ConnectionManager } from '../../ws/connection-manager';
import { readSessionMarksToShow } from './sessionMarks';
import { announceSessionsUpdated } from './sessionsUpdated';
import { noteSentMark } from './sessionMarksKnown';

/**
 * Tell every screen the mark the package just wrote for [sessionId], as an update of that
 * session. The package writes the mark before it answers the call that changed it, so reading
 * the table right after finds the new one.
 *
 * [sessionDir] is the folder the session works in, when it is known (the session that called the tool).
 *
 * Nothing but the update is sent: the screens put the session's row right from it, so they do
 * not have to read the whole list again. When the mark is not there to hand over (the package
 * is not installed) or cannot be read, the screens are asked to read the list again instead,
 * which is the way to find out what changed when it cannot be said.
 */
export async function announceSessionMark(
  sessionId: string,
  connections: ConnectionManager,
  sessionDir?: string,
): Promise<void> {
  try {
    const mark = (await readSessionMarksToShow()).get(sessionId);
    if (mark) {
      // Noted, so the change the table shows next is not told a second time by its watching.
      noteSentMark(sessionId, mark);
      // The folder the session lives in is what tells which screens the news is for. The mark says
      // where the package started the session, which is the one folder known for a session of another.
      const dir = sessionDir ?? (typeof mark.row.cwd === 'string' ? mark.row.cwd : undefined);
      announceSessionsUpdated(
        connections,
        { action: 'update', session: { sessionId, sessionMark: mark.row } },
        { sessionDirs: dir ? [dir] : [] },
      );
      return;
    }
  } catch (err) {
    console.error('[node-backend]', 'Failed to read the mark of a session:', err);
  }
  announceSessionsUpdated(connections, { action: 'refresh' });
}
