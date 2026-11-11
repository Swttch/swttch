import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { findStarter } from '../features/desktopSessions';
import { getSessionEntry } from '../features/getSessionEntry';
import { isArchivedRow } from '../features/sessionMarks';

/**
 * GET_SESSION_PARENT_TITLE: the session that started a session, for the line over its first message. Always
 * answers `ok`; every field is simply absent when there is none to give.
 *
 * Who started it is the session-management MCP's answer (`started-by`: its own record first, the Claude desktop
 * app's after), so this backend never reads the desktop app's files. The title and the archived state are this
 * app's own: the starter is looked up like any session in the list, so a name changed here shows here.
 */
export async function getSessionParentTitleHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string } | undefined;
  const starter = payload?.sessionId ? await findStarter(payload.sessionId) : undefined;
  const entry = starter?.cwd ? await getSessionEntry(starter.cwd, starter.sessionId) : null;
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    // Which session and which folder: what opening it takes.
    ...(starter && { parentSessionId: starter.sessionId }),
    ...(starter?.cwd && { parentSessionDir: starter.cwd }),
    ...(entry?.title && { title: entry.title }),
    // Whether the starter has been archived since: the line over the first message says so.
    ...(entry && { isArchived: isArchivedRow(entry.sessionMark?.row) }),
  });
}
