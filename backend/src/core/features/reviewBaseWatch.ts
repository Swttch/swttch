/**
 * Tell an open review that the file under it has moved (#359).
 *
 * The IDE reports every save; this decides whether any pending review cared.
 * Nothing is written and no decision is made here — the review surface is told,
 * and the user decides what to do about it.
 *
 * This is the early-warning half. It can miss (a save the IDE does not report,
 * a browser host with no IDE at all), so it is deliberately NOT what keeps the
 * file safe: the approval gate re-checks the same thing at the moment of
 * writing. Detection is a convenience; the gate is the guarantee.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { previewsForFile } from './diffPreview';
import { compareReviewBase } from './reviewBase';

/**
 * Check every pending review of [filePath] and notify the ones whose base no
 * longer matches disk.
 *
 * Never throws: this runs off a save notification, and a failure to check must
 * not take down the path that reports saves.
 */
export async function notifyReviewsOfFileChange(
  connections: ConnectionManager,
  filePath: string,
): Promise<void> {
  const pending = previewsForFile(filePath);
  if (pending.length === 0) return;

  for (const [toolUseId, preview] of pending) {
    try {
      // No selection is passed: the reviewer has not answered yet, so every
      // change is worth reporting. Which regions they end up keeping is a
      // question for the approval gate, not for this warning.
      const comparison = await compareReviewBase(preview);
      if (comparison.status !== 'changed') continue;

      if (!preview.sessionId) {
        // Without a session there is nobody to tell. Logged rather than
        // dropped silently, because it means a review is unguarded by the
        // warning and only the gate will catch it.
        console.error(
          '[node-backend]',
          `Review base changed for ${toolUseId} but it has no session; only the approval gate will catch this`,
        );
        continue;
      }

      connections.broadcastToSession(preview.sessionId, MessageType.REVIEW_BASE_CHANGED, {
        toolUseId,
        filePath: preview.filePath,
      });
      console.error(
        '[node-backend]',
        `Review base changed for ${toolUseId} (${preview.filePath}); told the review surface`,
      );
    } catch (err) {
      console.error('[node-backend]', `Failed to check review base for ${toolUseId}:`, err);
    }
  }
}
