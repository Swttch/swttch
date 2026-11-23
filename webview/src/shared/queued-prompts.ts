/** JSONL entry type for the CLI's message queue bookkeeping. */
export const QUEUE_OPERATION = 'queue-operation';

/** The shape of a `queue-operation` entry, as the CLI writes it. */
export interface QueueOperationEntry {
  type?: string;
  operation?: string;
  content?: string | null;
  timestamp?: string;
  /** Ties a `remove` to the `attachment` entry that carries the same message (its `source_uuid`). */
  commandUuid?: string;
}

export function isQueueOperation(entry: unknown): entry is QueueOperationEntry {
  return !!entry
    && typeof entry === 'object'
    && (entry as QueueOperationEntry).type === QUEUE_OPERATION;
}

/**
 * How many times each message was queued mid-turn, and so exists ONLY as queue
 * bookkeeping.
 *
 * A message typed while a turn is already running never becomes a `user` entry
 * in the session JSONL. The CLI records an `enqueue` when it accepts the message
 * and, later, one of two things:
 *
 *   enqueue → dequeue  accepted while idle; a normal `user` entry IS written, so
 *                      whoever reads the transcript already has the message.
 *   enqueue → remove   queued mid-turn; no `user` entry is ever written, so this
 *                      is the one that has to be recovered from the bookkeeping.
 *
 * Entries carry no id, so the queue is replayed in order: an `enqueue` joins the
 * back, a `dequeue` takes the front (the message was accepted while idle), and a
 * `remove` takes out the oldest waiting message of the same content. An enqueue
 * with no matching remove is still sitting in the queue and is not counted until
 * it is consumed.
 *
 * A message carrying an image is enqueued with NO content (the image is not text)
 * but removed with its text, so a `remove` that finds no waiting message of its
 * own content falls back to the oldest waiting one that has none. Without that the
 * message that had a picture on it was the only one that never got its bubble back
 * (#727 session: the bubble the desktop app shows was missing from ours).
 *
 * Lives in shared/ because two readers need the same answer from the same
 * transcript — the chat transcript rebuilding the message bubble, and the prompt
 * history deciding whether the user typed it. Two copies of a pairing rule this
 * quiet would drift, and the drift would show up as a message that appears in
 * one place and not the other.
 */
export function queuedMidTurnCounts(entries: readonly unknown[]): Map<string, number> {
  const waiting: string[] = [];
  const paired = new Map<string, number>();
  for (const entry of entries) {
    if (!isQueueOperation(entry)) continue;
    if (entry.operation === 'enqueue') {
      // A message with no words of its own (an image alone, or an image with the text kept elsewhere) has no content.
      waiting.push(typeof entry.content === 'string' ? entry.content : '');
    } else if (entry.operation === 'dequeue') {
      waiting.shift();
    } else if (entry.operation === 'remove' && typeof entry.content === 'string') {
      let index = waiting.indexOf(entry.content);
      if (index < 0) index = waiting.indexOf('');
      if (index < 0) continue;
      waiting.splice(index, 1);
      paired.set(entry.content, (paired.get(entry.content) ?? 0) + 1);
    }
  }
  return paired;
}
