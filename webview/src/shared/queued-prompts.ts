/** JSONL entry type for the CLI's message queue bookkeeping. */
export const QUEUE_OPERATION = 'queue-operation';

/** The shape of a `queue-operation` entry, as the CLI writes it. */
export interface QueueOperationEntry {
  type?: string;
  operation?: string;
  content?: string | null;
  timestamp?: string;
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
 * Entries carry no id, so pairs are matched by content in FIFO order, mirroring
 * the queue itself: the Nth enqueue of some content pairs with the Nth remove of
 * that same content. An enqueue with no matching remove is still sitting in the
 * queue and is not counted until it is consumed.
 *
 * Lives in shared/ because two readers need the same answer from the same
 * transcript — the chat transcript rebuilding the message bubble, and the prompt
 * history deciding whether the user typed it. Two copies of a pairing rule this
 * quiet would drift, and the drift would show up as a message that appears in
 * one place and not the other.
 */
export function queuedMidTurnCounts(entries: readonly unknown[]): Map<string, number> {
  const removes = new Map<string, number>();
  for (const entry of entries) {
    if (!isQueueOperation(entry)) continue;
    if (entry.operation !== 'remove' || typeof entry.content !== 'string') continue;
    removes.set(entry.content, (removes.get(entry.content) ?? 0) + 1);
  }

  const enqueues = new Map<string, number>();
  for (const entry of entries) {
    if (!isQueueOperation(entry)) continue;
    if (entry.operation !== 'enqueue' || typeof entry.content !== 'string') continue;
    enqueues.set(entry.content, (enqueues.get(entry.content) ?? 0) + 1);
  }

  const paired = new Map<string, number>();
  for (const [content, enqueued] of enqueues) {
    const count = Math.min(enqueued, removes.get(content) ?? 0);
    if (count > 0) paired.set(content, count);
  }
  return paired;
}
