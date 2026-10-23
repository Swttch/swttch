import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { logDebug } from '../../logging/log-level';

/**
 * Hand the text the user just copied in the chat to the host, so it lands on the
 * system clipboard the IDE and every other program paste from (#581).
 *
 * The webview waits for the answer: a copy that did not take must be told to the
 * user, because they would otherwise paste something older and believe it is
 * what they copied. An empty ACK means the host placed the text; an error ACK
 * means it did not.
 *
 * What the user copied is never logged here. A failure is logged with its
 * message only.
 */
export async function setClipboardHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const text = message.payload?.text;
  if (typeof text !== 'string' || text.length === 0) {
    // Nothing to place. Copying nothing leaves the clipboard as it was in every
    // other program, so this is an answer, not a fault.
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
    return;
  }

  const workingDirValue = message.payload?.workingDir;
  const workingDir =
    typeof workingDirValue === 'string' && workingDirValue.length > 0 ? workingDirValue : undefined;

  try {
    await bridge.setClipboard({ text, workingDir });
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.setClipboard() failed: ${msg}`);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: msg,
    });
  }
}
