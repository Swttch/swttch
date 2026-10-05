import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { logDebug } from '../../logging/log-level';

/**
 * Answer a webview that pasted into the chat input and found nothing on its own
 * clipboard (#278) with what the host can read from the system clipboard.
 *
 * The answer rides on the ACK, like pickFiles: the webview is waiting on that
 * one request and acts on `text` or `image` the moment they arrive.
 *
 * What the user copied is never logged here. A failure is logged with its
 * message only, and answers the webview with an error so its paste ends rather
 * than waiting for a clipboard that is not coming.
 */
export async function getClipboardHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const workingDirValue = message.payload?.workingDir;
  const workingDir =
    typeof workingDirValue === 'string' && workingDirValue.length > 0 ? workingDirValue : undefined;

  try {
    const { text, image } = await bridge.getClipboard({ workingDir });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      text,
      image,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.getClipboard() failed: ${msg}`);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: msg,
    });
  }
}
