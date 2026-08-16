import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { peekPreview } from '../features/diffPreview';

/**
 * Open a diff in the IDE.
 *
 * Two callers, one message. Either the sender supplies the contents, or it
 * names a pending permission request by `toolUseId` and the contents are read
 * from the preview held backend-side. The second is the file name in the
 * approval prompt: the diff can be closed while its question is still up
 * (Escape with the diff focused does that), and clicking the name brings it
 * back. Sending only the id keeps the file contents off the wire, so what is
 * shown is the text we diffed.
 */
export async function openDiffHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const toolUseId = message.payload?.toolUseId as string | undefined;
  let filePath = message.payload?.filePath as string | undefined;
  let oldContent = message.payload?.oldContent as string | undefined;
  let newContent = message.payload?.newContent as string | undefined;
  let sessionId = message.payload?.sessionId as string | undefined;
  let controlRequestId = message.payload?.controlRequestId as string | undefined;

  if (filePath === undefined && toolUseId) {
    const preview = peekPreview(toolUseId);
    // Left alone rather than consumed: the question is still open, and the
    // eventual answer needs this entry to know what to write.
    if (!preview) {
      // The request was answered already, so there is nothing left to show.
      // Not an error — the click just lost a race with the decision.
      connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
      return;
    }
    filePath = preview.filePath;
    oldContent = preview.oldContent;
    newContent = preview.newContent;
    sessionId ??= preview.sessionId;
    controlRequestId ??= preview.controlRequestId;
  }

  try {
    await bridge.openDiff({
      filePath: filePath as string,
      oldContent: oldContent as string,
      newContent: newContent as string,
      toolUseId,
      sessionId,
      controlRequestId,
    });
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
