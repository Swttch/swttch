import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { peekPreview } from '../features/diffPreview';

/**
 * Open OUR diff page in an IDE editor tab, for a pending permission request.
 *
 * The counterpart to {@link openDiffHandler} for the built-in surface, and the
 * webview's way back to a review it closed while the question was still up —
 * clicking the file name in the approval prompt lands here.
 *
 * Only the id travels, and nothing else needs to: the page fetches the change
 * itself with GET_DIFF_PREVIEW. The preview is still checked here so a click
 * that lost the race with a decision opens nothing, rather than a tab that
 * immediately reports there is nothing to review.
 */
export async function openDiffTabHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const toolUseId = message.payload?.toolUseId as string | undefined;

  const ok = () =>
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });

  if (!toolUseId) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'OPEN_DIFF_TAB requires a toolUseId',
    });
    return;
  }

  // Left alone rather than consumed: the question is still open, and the
  // eventual answer needs this entry to know what to write.
  if (!peekPreview(toolUseId)) {
    // Answered already, so there is nothing to open. Not an error — the click
    // just lost a race with the decision.
    ok();
    return;
  }

  try {
    await bridge.openDiffTab({ toolUseId });
    ok();
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
