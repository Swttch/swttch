import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { logDebug } from '../../logging/log-level';

/**
 * Answer a webview that pasted with the middle mouse button with the text of the
 * host's PRIMARY selection (#754), on the ACK of that request.
 *
 * What the user selected is never logged here. A failure is logged with its message
 * only, and answers with an error so the browser's own paste stands.
 */
export async function getPrimarySelectionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const workingDirValue = message.payload?.workingDir;
  const workingDir =
    typeof workingDirValue === 'string' && workingDirValue.length > 0 ? workingDirValue : undefined;

  try {
    const text = await bridge.getPrimarySelection({ workingDir });
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.getPrimarySelection() failed: ${msg}`);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: msg,
    });
  }
}
