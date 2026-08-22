import type { ConnectionManager } from '../../ws/connection-manager';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { peekPreview } from '../features/diffPreview';

/**
 * Hand the webview the stored change for a pending permission request, so it
 * can draw the review diff itself.
 *
 * The IDE reads the same preview through OPEN_DIFF and renders it in a native
 * diff tab. A browser has no such tab: `BrowserBridge.openDiff` is a no-op, so
 * outside an IDE the review has been unavailable entirely — the approval prompt
 * could name the file but never show what was in it. This is that door.
 *
 * Peeked rather than consumed, exactly as OPEN_DIFF does: the question is still
 * open, and the eventual answer needs the entry to know what to write.
 */
export async function getDiffPreviewHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
): Promise<void> {
  const toolUseId = message.payload?.toolUseId as string | undefined;
  const preview = toolUseId ? peekPreview(toolUseId) : undefined;

  // Sent whole rather than picked apart. The stored preview is the shape the
  // backend already reasons about, and trimming it to "what the UI needs
  // today" is the edit this project's original-data rule exists to prevent.
  //
  // A missing preview is not an error: the request may have been answered
  // already, or it was never a file edit worth diffing. The caller draws
  // nothing and the prompt stays as it was.
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    preview: preview ?? null,
  });
}
