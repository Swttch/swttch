import type { ConnectionManager } from '../../ws/connection-manager';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { refreshReviewAgainstDisk } from '../features/refreshReview';

/**
 * Rebuild a pending review against the current file and hand back the result
 * (#359).
 *
 * Reached from the review surface when the base has moved — either because a
 * save was reported while the review was open, or because the approval gate
 * refused to answer with a stale base.
 *
 * Answers with the whole refreshed preview, the same shape GET_DIFF_PREVIEW
 * returns, so the surface redraws through the path it already has instead of
 * learning a second one.
 */
export async function refreshDiffPreviewHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
): Promise<void> {
  const toolUseId = message.payload?.toolUseId as string | undefined;
  if (!toolUseId) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'REFRESH_DIFF_PREVIEW requires toolUseId',
    });
    return;
  }

  const outcome = await refreshReviewAgainstDisk(toolUseId);
  // Sizes, not contents: enough to tell "the surface got a new base" from "the
  // surface got the same one back" when a refresh appears to do nothing, without
  // putting file contents in a log.
  const shape =
    'preview' in outcome
      ? ` old=${outcome.preview.oldContent.length}B new=${outcome.preview.newContent.length}B hunks=${outcome.preview.hunks.length}`
      : '';
  console.error('[node-backend]', `Refreshed review ${toolUseId}: ${outcome.status}${shape}`);

  // Sent whole, as GET_DIFF_PREVIEW does: the stored preview is the shape the
  // backend reasons about, and trimming it here is the edit the project's
  // original-data rule exists to prevent.
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    outcome: outcome.status,
    reason: 'reason' in outcome ? outcome.reason : undefined,
    preview: 'preview' in outcome ? outcome.preview : null,
  });
}
