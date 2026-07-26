import { describe, it, expect } from 'vitest';
import { restoreQueuedMessages } from '../restoreQueuedMessages';
import { LoadedMessageDto } from '../../../types';
import { LoadedMessageType } from '../../../dto/common';

function user(uuid: string, content: string): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    timestamp: '2026-07-26T17:00:00.000Z',
    message: { role: 'user', content },
  } as LoadedMessageDto;
}

function assistant(uuid: string, text: string): LoadedMessageDto {
  return {
    type: LoadedMessageType.Assistant,
    uuid,
    timestamp: '2026-07-26T17:00:01.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  } as unknown as LoadedMessageDto;
}

function queueOp(operation: string, content: string | null, timestamp: string): LoadedMessageDto {
  return { type: 'queue-operation', operation, content, timestamp } as unknown as LoadedMessageDto;
}

describe('restoreQueuedMessages', () => {
  it('restores an enqueue/remove pair as a user message at the remove position', () => {
    const messages = [
      user('u1', 'first'),
      queueOp('enqueue', '벌써?', '2026-07-26T17:31:50.321Z'),
      assistant('a1', 'working'),
      queueOp('remove', '벌써?', '2026-07-26T17:31:54.363Z'),
      assistant('a2', '네, 벌써 찾았습니다'),
    ];

    const result = restoreQueuedMessages(messages);

    expect(result.map(m => m.type)).toEqual([
      LoadedMessageType.User,
      LoadedMessageType.Assistant,
      LoadedMessageType.User,
      LoadedMessageType.Assistant,
    ]);
    // The restored message sits where the CLI actually consumed it — between the
    // turn it interrupted and the reply that answers it.
    expect(result[2].message?.content).toBe('벌써?');
  });

  it('drops enqueue/dequeue pairs, which the CLI already wrote as user entries', () => {
    const messages = [
      queueOp('enqueue', 'hello', '2026-07-26T17:29:29.145Z'),
      queueOp('dequeue', null, '2026-07-26T17:29:29.145Z'),
      user('u1', 'hello'),
      assistant('a1', 'hi'),
    ];

    const result = restoreQueuedMessages(messages);

    expect(result.map(m => m.type)).toEqual([LoadedMessageType.User, LoadedMessageType.Assistant]);
    expect(result.filter(m => m.message?.content === 'hello')).toHaveLength(1);
  });

  it('removes queue-operation entries from the rendered list', () => {
    const messages = [
      queueOp('enqueue', 'x', '2026-07-26T17:00:00.000Z'),
      queueOp('remove', 'x', '2026-07-26T17:00:05.000Z'),
    ];

    const result = restoreQueuedMessages(messages);

    expect(result.some(m => (m as unknown as { type: string }).type === 'queue-operation')).toBe(false);
  });

  it('matches same-content messages in FIFO order', () => {
    const messages = [
      queueOp('enqueue', 'dup', '2026-07-26T17:00:00.000Z'),
      queueOp('enqueue', 'dup', '2026-07-26T17:00:01.000Z'),
      queueOp('remove', 'dup', '2026-07-26T17:00:02.000Z'),
      queueOp('remove', 'dup', '2026-07-26T17:00:03.000Z'),
    ];

    const result = restoreQueuedMessages(messages);

    expect(result).toHaveLength(2);
    expect(result.every(m => m.message?.content === 'dup')).toBe(true);
  });

  it('leaves a message with no matching remove out of the list', () => {
    // Still queued when the session was written — not yet consumed.
    const messages = [
      user('u1', 'first'),
      queueOp('enqueue', 'pending', '2026-07-26T17:00:00.000Z'),
    ];

    const result = restoreQueuedMessages(messages);

    expect(result.map(m => m.uuid)).toEqual(['u1']);
  });

  it('returns the same array when there are no queue operations', () => {
    const messages = [user('u1', 'a'), assistant('a1', 'b')];

    const result = restoreQueuedMessages(messages);

    expect(result).toBe(messages);
  });
});
