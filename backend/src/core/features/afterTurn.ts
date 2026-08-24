/**
 * Messages that must reach Claude, but only once the turn they belong to is
 * over.
 *
 * The CLI keeps a queue of its own for user messages that arrive mid-turn, and
 * it EMPTIES that queue when the turn ends rather than delivering what is in it.
 * Measured on a real session: the edit notice was written to stdin at .477,
 * enqueued by the CLI at .586, and removed at .769 — while the same session's
 * ordinary user message went `enqueue` → `dequeue`. So a message sent during a
 * turn is not merely late; it is dropped, and nothing reports that it was.
 *
 * Answering a permission request is exactly that moment: the reviewer's answer
 * arrives while the CLI is still finishing the turn that asked, so anything
 * sent alongside the `control_response` lands in the queue that is about to be
 * cleared.
 *
 * Holding it here until the CLI reports `result` puts it on the far side of
 * that cleanup, where an ordinary user message would be.
 */

/** Messages waiting for their session's current turn to finish. */
const pending = new Map<string, string[]>();

/**
 * Hold [content] until [sessionId]'s current turn ends, then send it.
 *
 * Queued rather than sent even when no turn appears to be running: "appears" is
 * the whole difficulty — the answer to a permission request is given while the
 * CLI is mid-turn by definition, and the streaming flag has already been
 * cleared by then on some paths. Waiting for the next `result` is the one
 * signal that means the CLI is done with the queue.
 */
export function sendAfterTurn(sessionId: string, content: string): void {
  const queue = pending.get(sessionId);
  if (queue) queue.push(content);
  else pending.set(sessionId, [content]);
}

/**
 * Everything held for [sessionId], in the order it was queued, and clear it.
 *
 * Called when the CLI reports `result` for that session. Returns an empty array
 * when nothing was waiting, which is the ordinary case.
 */
export function takeMessagesForFinishedTurn(sessionId: string): string[] {
  const queue = pending.get(sessionId);
  if (!queue) return [];
  pending.delete(sessionId);
  return queue;
}

/**
 * Drop anything held for [sessionId] without sending it.
 *
 * For a session that ends before its turn reports a result — the process died,
 * or the user closed it. Holding the message would leak it into whatever
 * session reuses the id.
 */
export function clearMessagesForSession(sessionId: string): void {
  pending.delete(sessionId);
}

/** Test seam: forget every held message. */
export function clearAllPendingMessages(): void {
  pending.clear();
}
