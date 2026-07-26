import { LoadedMessageDto } from '../../types';
import { LoadedMessageType, MessageRole } from '../../dto/common';

/** JSONL entry type for the CLI's message queue bookkeeping. */
const QUEUE_OPERATION = 'queue-operation';

interface QueueOperationEntry {
  type: string;
  operation?: string;
  content?: string | null;
  timestamp?: string;
}

function isQueueOperation(message: LoadedMessageDto): boolean {
  return (message as unknown as QueueOperationEntry).type === QUEUE_OPERATION;
}

/**
 * Rebuild the user messages that the CLI only recorded as queue bookkeeping.
 *
 * When a message is typed while a turn is already running, the CLI does not
 * write it to the session JSONL as a `user` entry. It records an `enqueue` when
 * the message is accepted and a `remove` when it is finally consumed — so
 * re-reading the session loses the message entirely.
 *
 * Two shapes exist, and only one needs rebuilding:
 *
 *   enqueue → dequeue  the message was accepted while idle; the CLI writes a
 *                      normal `user` entry for it, so rebuilding would duplicate it.
 *   enqueue → remove   the message was queued mid-turn; no `user` entry is ever
 *                      written, so this is the one to restore.
 *
 * The rebuilt message is placed at the `remove`, not the `enqueue`: `remove` is
 * when the CLI actually consumed the message, so it lands between the turn it
 * interrupted and the reply that answers it. Placing it at the `enqueue` would
 * put it before a stretch of output that had not yet seen it.
 *
 * Pairs are matched by content in FIFO order, mirroring the queue itself — the
 * entries carry no id to match on. An `enqueue` with no matching `remove` is
 * still queued and is left out until it is consumed.
 *
 * Display-time reconstruction only: the loaded entries are never mutated, and
 * the queue-operation entries themselves are dropped from the rendered list.
 */
export function restoreQueuedMessages(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  let hasQueueOperation = false;
  for (const message of messages) {
    if (isQueueOperation(message)) {
      hasQueueOperation = true;
      break;
    }
  }
  if (!hasQueueOperation) return messages;

  // Count how many `remove`s each content has, so an enqueue is only rebuilt
  // when a matching consumption exists. FIFO: the Nth enqueue of some content
  // pairs with the Nth remove of that same content.
  const removesByContent = new Map<string, number>();
  for (const message of messages) {
    if (!isQueueOperation(message)) continue;
    const entry = message as unknown as QueueOperationEntry;
    if (entry.operation !== 'remove' || typeof entry.content !== 'string') continue;
    removesByContent.set(entry.content, (removesByContent.get(entry.content) ?? 0) + 1);
  }

  const enqueuedSoFar = new Map<string, number>();
  const restorable = new Set<string>();
  for (const message of messages) {
    if (!isQueueOperation(message)) continue;
    const entry = message as unknown as QueueOperationEntry;
    if (entry.operation !== 'enqueue' || typeof entry.content !== 'string') continue;
    const seen = (enqueuedSoFar.get(entry.content) ?? 0) + 1;
    enqueuedSoFar.set(entry.content, seen);
    if (seen <= (removesByContent.get(entry.content) ?? 0)) {
      restorable.add(entry.content);
    }
  }

  const rebuiltSoFar = new Map<string, number>();
  const result: LoadedMessageDto[] = [];
  for (const message of messages) {
    if (!isQueueOperation(message)) {
      result.push(message);
      continue;
    }

    const entry = message as unknown as QueueOperationEntry;
    if (entry.operation !== 'remove' || typeof entry.content !== 'string') continue;
    if (!restorable.has(entry.content)) continue;

    const index = (rebuiltSoFar.get(entry.content) ?? 0) + 1;
    rebuiltSoFar.set(entry.content, index);

    result.push({
      type: LoadedMessageType.User,
      // Stable across reloads so React keys and uuid-based dedupe stay put.
      uuid: `queued-${entry.timestamp ?? ''}-${index}`,
      timestamp: entry.timestamp,
      message: { role: MessageRole.User, content: entry.content },
    } as LoadedMessageDto);
  }

  return result;
}
