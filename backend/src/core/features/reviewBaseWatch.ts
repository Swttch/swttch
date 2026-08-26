/**
 * Tell an open review that the file under it has moved (#359).
 *
 * Watching starts when a review is stored and stops when it is answered, so the
 * window being watched is exactly the window in which the base can go stale.
 *
 * HOW the change is noticed is the bridge's business, not this module's: in an
 * IDE the host reports saves it already sees, and standalone the bridge watches
 * the file itself. Asking `bridge.watchFile` rather than reaching for `fs.watch`
 * is what keeps both environments covered — the first cut of this feature wired
 * the IDE path straight through and left standalone with nothing.
 *
 * This is the early-warning half. It can miss, so it is deliberately NOT what
 * keeps the file safe: the approval gate re-reads the file at the moment of
 * writing. Detection is a convenience; the gate is the guarantee.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { MessageType } from '../../shared';
import { peekPreview, onPreviewConsumed } from './diffPreview';
import { compareReviewBase } from './reviewBase';

/** Stop-watching callbacks for reviews still awaiting an answer, by tool_use_id. */
const watching = new Map<string, () => void>();

// Release the watch as soon as the review it belongs to is answered. Registered
// here rather than called from takePreview so the dependency points one way:
// this module knows about previews, previews know nothing about watching.
onPreviewConsumed((toolUseId) => stopWatchingReviewBase(toolUseId));

/**
 * Start watching the file [toolUseId]'s review is about.
 *
 * Never throws and never blocks: the permission prompt is what the user is
 * waiting on, and a watch we could not start must not hold it up. Returns
 * quietly when there is nothing to watch.
 */
export async function watchReviewBase(
  bridge: Bridge,
  connections: ConnectionManager,
  toolUseId: string,
  filePath: string,
): Promise<void> {
  // Replace any watch left from a retried edit on the same request, so a
  // superseded one cannot outlive it.
  stopWatchingReviewBase(toolUseId);

  try {
    const stop = await bridge.watchFile(filePath, () => {
      void reportIfBaseMoved(connections, toolUseId);
    });
    watching.set(toolUseId, stop);
  } catch (err) {
    console.error('[node-backend]', `Could not watch the review base for ${toolUseId}:`, err);
  }
}

/** Stop watching, once the review is answered or replaced. */
export function stopWatchingReviewBase(toolUseId: string): void {
  const stop = watching.get(toolUseId);
  if (!stop) return;
  watching.delete(toolUseId);
  try {
    stop();
  } catch (err) {
    console.error('[node-backend]', `Failed to stop watching for ${toolUseId}:`, err);
  }
}

/** Exposed for tests; production stops watches as reviews are answered. */
export function stopAllReviewBaseWatches(): void {
  for (const toolUseId of [...watching.keys()]) stopWatchingReviewBase(toolUseId);
}

/**
 * Check the review against disk and tell the surface when it has moved.
 *
 * The preview is peeked, not taken: the question is still open, and the answer
 * still needs the entry.
 */
async function reportIfBaseMoved(
  connections: ConnectionManager,
  toolUseId: string,
): Promise<void> {
  const preview = peekPreview(toolUseId);
  if (!preview) {
    // Answered while the notification was in flight — nothing to warn about.
    stopWatchingReviewBase(toolUseId);
    return;
  }

  try {
    // No selection is passed: the reviewer has not answered yet, so every change
    // is worth reporting. Which regions they end up keeping is the gate's
    // question, not this one's.
    const comparison = await compareReviewBase(preview);
    if (comparison.status !== 'changed') return;

    if (!preview.sessionId) {
      // Without a session there is nobody to tell. Logged rather than dropped
      // silently, because it means this review is unguarded by the warning and
      // only the gate will catch it.
      console.error(
        '[node-backend]',
        `Review base changed for ${toolUseId} but it has no session; only the approval gate will catch this`,
      );
      return;
    }

    connections.broadcastToSession(preview.sessionId, MessageType.REVIEW_BASE_CHANGED, {
      toolUseId,
      filePath: preview.filePath,
      reason: 'changed',
      overlapsAccepted: comparison.overlapsAccepted,
      // Not the gate: nothing was blocked, the reviewer is simply being warned
      // while they still have time to act on it.
      blockedApproval: false,
    });
    console.error(
      '[node-backend]',
      `Review base changed for ${toolUseId} (${preview.filePath}); told the review surface`,
    );
  } catch (err) {
    console.error('[node-backend]', `Failed to check the review base for ${toolUseId}:`, err);
  }
}
