import type { ConnectionManager } from '../../ws/connection-manager';
import { getSessionEntry } from './getSessionEntry';
import { announceSessionsUpdated, nextSessionEventTs } from './sessionsUpdated';

/**
 * Tell the screens a session came to exist, with its row.
 *
 * The row is the one the lists show for it, read from the session's transcript once here, so that no
 * screen has to read its whole list to find the session. Only the screens whose list can hold it are
 * told, and [exceptConnectionId] is left out (the screen that made the session may already have a row of
 * its own for it).
 *
 * A session the lists do not show (a sidechain, a transcript that has not held a conversation) is
 * not announced. When the row cannot be read, every screen is asked to read its list, which finds
 * out what there is.
 */
export async function announceSessionCreated(
  connections: ConnectionManager,
  sessionId: string,
  workingDir: string,
  exceptConnectionId?: string,
): Promise<void> {
  // The row is the session as of when its read begins, so that is the time it is told at: what was said while
  // it was read is not in it, and goes onto it on the screens.
  const readAt = nextSessionEventTs();
  try {
    const row = await getSessionEntry(workingDir, sessionId);
    if (row === null) return;
    announceSessionsUpdated(
      connections,
      { action: 'create', session: row as unknown as Record<string, unknown> },
      { sessionDirs: [workingDir], exceptConnectionId, ts: readAt },
    );
  } catch (err) {
    console.error('[node-backend]', `Failed to read the row of session ${sessionId}:`, err);
    announceSessionsUpdated(connections, { action: 'refresh' });
  }
}
