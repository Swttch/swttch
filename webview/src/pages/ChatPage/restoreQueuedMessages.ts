import { LoadedMessageDto } from '../../types';
import { LoadedMessageType, MessageRole } from '../../dto/common';
import { isQueueOperation, queuedMidTurnCounts, type QueueOperationEntry } from '@/shared';

/**
 * Rebuild the user messages that the CLI only recorded as queue bookkeeping.
 *
 * When a message is typed while a turn is already running, the CLI does not
 * write it to the session JSONL as a `user` entry. It records an `enqueue` when
 * the message is accepted and a `remove` when it is finally consumed — so
 * re-reading the session loses the message entirely.
 *
 * Which of those queue entries stand in for a message with no `user` entry is
 * decided by `queuedMidTurnCounts` in shared/, because the prompt history needs
 * the same answer about the same transcript.
 *
 * The rebuilt message is placed at the `remove`, not the `enqueue`: `remove` is
 * when the CLI actually consumed the message, so it lands between the turn it
 * interrupted and the reply that answers it. Placing it at the `enqueue` would
 * put it before a stretch of output that had not yet seen it.
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

  const restorable = queuedMidTurnCounts(messages);

  const rebuiltSoFar = new Map<string, number>();
  const result: LoadedMessageDto[] = [];
  for (const message of messages) {
    if (!isQueueOperation(message)) {
      result.push(message);
      continue;
    }

    const entry = message as unknown as QueueOperationEntry;
    if (entry.operation !== 'remove' || typeof entry.content !== 'string') continue;
    if ((restorable.get(entry.content) ?? 0) === 0) continue;

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
