import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { collectSessionOutputs } from '../features/collectSessionOutputs';

/**
 * GET_SESSION_OUTPUTS — index what one session made or was handed back: pictures
 * tools returned, files sent with `SendUserFile` and published Artifact pages.
 *
 * The transcript is paged, so the webview holds only the newest slice; this
 * answers for the whole session, without any bytes. Like GET_SESSION_ASSETS it
 * has no sponsor gate: seeing the list is open to everyone.
 */
export async function getSessionOutputsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as { workingDir?: string; sessionId?: string } | undefined;
    const workingDir = payload?.workingDir;
    const sessionId = payload?.sessionId;

    if (!workingDir || !sessionId) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir and sessionId are required',
      });
      return;
    }

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      outputs: await collectSessionOutputs(workingDir, sessionId),
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
