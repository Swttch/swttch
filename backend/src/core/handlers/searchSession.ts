import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { searchSessionText } from '../features/searchSessionText';

/**
 * SEARCH_SESSION — which entries of a session contain a piece of text, for the
 * find bar. Answers with coordinates and counts only; the entries themselves
 * stay on the normal paged load path.
 */
export async function searchSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as {
      workingDir?: string;
      sessionId?: string;
      query?: string;
    } | undefined;

    if (!payload?.workingDir || !payload?.sessionId || typeof payload.query !== 'string') {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir, sessionId and query are required',
      });
      return;
    }

    const result = await searchSessionText(payload.workingDir, payload.sessionId, payload.query);

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      ...result,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
