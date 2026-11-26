import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { logDebug } from '../../logging/log-level';

/**
 * Answer a webview that pasted and needs the host's word on the clipboard (#278,
 * #752) with what the host can read from the system clipboard: text, an image, or
 * files for the chat input, and text alone when the request says `textOnly`.
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

  // A plain text field (a search box, a settings field) can take only text, so files
  // on the clipboard must not be handed to the chat on its behalf (#752).
  const textOnly = message.payload?.textOnly === true;

  try {
    const { text, image, files } = await bridge.getClipboard({ workingDir });
    if (textOnly) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        text,
        image: null,
      });
      return;
    }
    if (files.length > 0) {
      // Files copied in a file manager take the way a drop of them takes: the chat already
      // turns NATIVE_DROP_ENTRIES into chips, with the same paths a drop carries. What else
      // the clipboard holds (a file manager may add the names as text) is not pasted
      // beside them.
      connections.sendTo(connectionId, MessageType.NATIVE_DROP_ENTRIES, { entries: files });
      // The count lets the composer tell "files were handed over" from "nothing there".
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        text: null,
        image: null,
        files: files.length,
      });
      return;
    }
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
