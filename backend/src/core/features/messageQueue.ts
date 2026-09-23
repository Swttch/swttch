/**
 * The explicit, backend-owned queue behind the "queue" composer follow-up
 * setting.
 *
 * Sending straight through mid-turn (see `afterTurn.ts` and `sendMessage.ts`)
 * hands the message to the CLI's own internal buffer, which is invisible to
 * every webview until the CLI consumes it — nothing to show a stacked bubble
 * for, and nothing a user can cancel. This module is the alternative a session
 * opts into on purpose: a message queued here is held HERE, not written to
 * stdin at all, until the session's current turn reports `result`. That is
 * what makes it visible (broadcast on every change) and cancellable (removed
 * before it is ever sent) in a way the CLI's own queue is not.
 *
 * Data only. Sending a released entry to the CLI process and broadcasting the
 * change is `claude-process.ts`'s job, the same split `afterTurn.ts` uses —
 * this module never imports `sendMessageToProcess` itself.
 */

/** One message waiting in a session's queue. */
export interface QueuedMessageEntry {
  /** Unique within the session's queue; how a cancel finds this entry again. */
  id: string;
  content: string;
  attachments?: Array<
    | { type: 'image'; fileName: string; mimeType: string; base64: string }
    | { type: 'file'; fileName: string; absolutePath: string }
    | { type: 'folder'; folderName: string; absolutePath: string }
  >;
  /** `Date.now()` at the moment it was queued, for FIFO ordering and display. */
  queuedAt: number;
}

/** Queues in flight, keyed by session id. */
const queues = new Map<string, QueuedMessageEntry[]>();

/** Add [entry] to the end of [sessionId]'s queue. */
export function enqueueMessage(sessionId: string, entry: QueuedMessageEntry): void {
  const queue = queues.get(sessionId);
  if (queue) queue.push(entry);
  else queues.set(sessionId, [entry]);
}

/**
 * Remove the entry with [id] from [sessionId]'s queue before it is sent.
 *
 * Returns whether an entry was actually removed, so the caller can tell a real
 * cancel from one that arrived too late (the entry was already released).
 */
export function removeQueuedMessage(sessionId: string, id: string): boolean {
  const queue = queues.get(sessionId);
  if (!queue) return false;
  const index = queue.findIndex(entry => entry.id === id);
  if (index === -1) return false;
  queue.splice(index, 1);
  if (queue.length === 0) queues.delete(sessionId);
  return true;
}

/** Everything currently waiting for [sessionId], oldest first. Never mutated by the caller. */
export function getQueuedMessages(sessionId: string): QueuedMessageEntry[] {
  return queues.get(sessionId) ?? [];
}

/**
 * Remove and return the oldest entry waiting for [sessionId], or undefined
 * when nothing is queued.
 *
 * Only the front is taken, not the whole queue: releasing every held message
 * back-to-back at once would write the second one to stdin while the CLI is
 * already mid-turn on the first, which falls back to the CLI's own invisible
 * mid-turn buffer for everything after the first — exactly what this module
 * exists to avoid. One turn, one release; the next entry waits for the next
 * `result`.
 */
export function dequeueNextMessage(sessionId: string): QueuedMessageEntry | undefined {
  const queue = queues.get(sessionId);
  if (!queue || queue.length === 0) return undefined;
  const entry = queue.shift();
  if (queue.length === 0) queues.delete(sessionId);
  return entry;
}

/**
 * Drop everything queued for [sessionId] without sending it.
 *
 * For a session whose process died: no turn will ever end to release these,
 * and holding them would leak into whatever session reuses the id.
 */
export function clearQueuedMessages(sessionId: string): void {
  queues.delete(sessionId);
}

/** Test seam: forget every queued message across every session. */
export function clearAllQueuedMessages(): void {
  queues.clear();
}
