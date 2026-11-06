import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { findDesktopSession } from '../features/findDesktopParentSessionTitle';

/**
 * GET_DESKTOP_SESSION: what Claude Desktop's own file says about a session named by its Desktop id (`local_…`):
 * its title, the CLI session it runs and the folder it works in. For the chat text that links to a session and
 * the card for a message sent to one. Always answers `ok`; `session` is absent when there is no such file.
 */
export async function getDesktopSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { desktopSessionId?: string } | undefined;
  const session = payload?.desktopSessionId ? await findDesktopSession(payload.desktopSessionId) : undefined;
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...(session !== undefined && { session }),
  });
}
