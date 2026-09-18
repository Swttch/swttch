import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { collectSessionSends } from '../features/collectSessionSends';

/**
 * GET_SESSION_SENDS — the index of every send the user typed in a session, for
 * the send index rail.
 */
export async function getSessionSendsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as {
      workingDir?: string;
      sessionId?: string;
    } | undefined;

    if (!payload?.workingDir || !payload?.sessionId) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir and sessionId are required',
      });
      return;
    }

    const sends = await collectSessionSends(payload.workingDir, payload.sessionId);

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      sends,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
