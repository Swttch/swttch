import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readSessionOutputImage } from '../features/collectSessionOutputs';

/**
 * GET_SESSION_OUTPUT_DATA — one tool-returned picture's bytes by its coordinate.
 *
 * The counterpart to GET_SESSION_OUTPUTS. The image block's own `source` object
 * is returned untouched. A coordinate that no longer resolves answers `gone`,
 * an ordinary outcome when the session was rewound while the viewer was open.
 */
export async function getSessionOutputDataHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as
      | { workingDir?: string; sessionId?: string; entryUuid?: string; blockIndex?: number; partIndex?: number }
      | undefined;
    const { workingDir, sessionId, entryUuid, blockIndex, partIndex } = payload ?? {};

    if (!workingDir || !sessionId || !entryUuid || typeof blockIndex !== 'number' || typeof partIndex !== 'number') {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir, sessionId, entryUuid, blockIndex and partIndex are required',
      });
      return;
    }

    const source = await readSessionOutputImage(workingDir, sessionId, { entryUuid, blockIndex, partIndex });
    connections.sendTo(
      connectionId,
      MessageType.ACK,
      source ? { requestId: message.requestId, status: 'ok', source } : { requestId: message.requestId, status: 'gone' },
    );
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
