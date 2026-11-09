import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { findDesktopParentSession } from '../features/findDesktopParentSessionTitle';

/**
 * GET_SESSION_PARENT_TITLE: the title of the Claude Desktop session that started a session, for the line over
 * its first message. Always answers `ok`; the title is simply absent when there is none to give.
 */
export async function getSessionParentTitleHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string } | undefined;
  const parent = payload?.sessionId ? await findDesktopParentSession(payload.sessionId) : undefined;
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...(parent?.title !== undefined && { title: parent.title }),
    // Whether the starter has been archived since: the line over the first message says so.
    ...(parent?.isArchived !== undefined && { isArchived: parent.isArchived }),
  });
}
