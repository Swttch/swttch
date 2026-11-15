import type { ConnectionManager } from '../../ws/connection-manager';
import { getSessionEntry } from './getSessionEntry';
import { announceSessionsUpdated, nextSessionEventTs } from './sessionsUpdated';

/** How often the transcript is read again while it holds no conversation, and how long that goes on. */
const RETRY_EVERY_MS = 500;
const GIVE_UP_AFTER_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tell the screens a session came to exist, with its row.
 *
 * The row is the one the lists show for it, read from the session's transcript once here, so that no
 * screen has to read its whole list to find the session. Only the screens whose list can hold it are
 * told, and [exceptConnectionId] is left out (the screen that made the session may already have a row of
 * its own for it).
 *
 * A transcript that has just been made may not hold a conversation yet (the CLI writes the name of the
 * session first and the first message a moment later), and the lists do not show such a session. It is
 * read again until it does, as the lists will then show it, and given up on after a while: a session the
 * lists never show (a sidechain) must not be read for ever. When the row cannot be read at all, every
 * screen is asked to read its list, which finds out what there is.
 */
export async function announceSessionCreated(
  connections: ConnectionManager,
  sessionId: string,
  workingDir: string,
  exceptConnectionId?: string,
): Promise<void> {
  for (let waited = 0; ; waited += RETRY_EVERY_MS) {
    // The row is the session as of when its read begins, so that is the time it is told at: what was said
    // while it was read is not in it, and goes onto it on the screens.
    const readAt = nextSessionEventTs();
    let row;
    try {
      row = await getSessionEntry(workingDir, sessionId);
    } catch (err) {
      console.error('[node-backend]', `Failed to read the row of session ${sessionId}:`, err);
      announceSessionsUpdated(connections, { action: 'refresh' });
      return;
    }
    if (row !== null) {
      announceSessionsUpdated(
        connections,
        { action: 'create', session: row as unknown as Record<string, unknown> },
        { sessionDirs: [workingDir], exceptConnectionId, ts: readAt },
      );
      return;
    }
    if (waited >= GIVE_UP_AFTER_MS) return;
    await sleep(RETRY_EVERY_MS);
  }
}
