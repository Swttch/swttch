import { describe, it, expect } from 'vitest';
import { isQueueOperation, queuedMidTurnCounts, QUEUE_OPERATION } from '../queued-prompts';

const op = (operation: string, content: string) => ({ type: QUEUE_OPERATION, operation, content });
const user = (text: string) => ({ type: 'user', message: { role: 'user', content: text } });

describe('isQueueOperation', () => {
  it('recognises only the queue bookkeeping entries', () => {
    expect(isQueueOperation(op('enqueue', 'a'))).toBe(true);
    expect(isQueueOperation(user('a'))).toBe(false);
    expect(isQueueOperation(null)).toBe(false);
    expect(isQueueOperation('queue-operation')).toBe(false);
  });
});

describe('queuedMidTurnCounts', () => {
  it('counts a message queued mid-turn, which has no user entry of its own', () => {
    const counts = queuedMidTurnCounts([op('enqueue', 'sent while busy'), op('remove', 'sent while busy')]);
    expect(counts.get('sent while busy')).toBe(1);
  });

  it('ignores a message accepted while idle, which the CLI wrote a user entry for', () => {
    // enqueue → dequeue is the shape that already has a `user` entry; counting it
    // would show the message twice.
    const counts = queuedMidTurnCounts([
      op('enqueue', 'sent while idle'),
      op('dequeue', 'sent while idle'),
      user('sent while idle'),
    ]);
    expect(counts.has('sent while idle')).toBe(false);
  });

  it('ignores a message still sitting in the queue', () => {
    const counts = queuedMidTurnCounts([op('enqueue', 'not consumed yet')]);
    expect(counts.has('not consumed yet')).toBe(false);
  });

  it('pairs repeats of the same text one for one', () => {
    // The entries carry no id, so identical text can only be matched by count.
    const counts = queuedMidTurnCounts([
      op('enqueue', 'again'), op('enqueue', 'again'), op('enqueue', 'again'),
      op('remove', 'again'), op('remove', 'again'),
    ]);
    expect(counts.get('again')).toBe(2);
  });

  it('ignores entries with no content and non-queue entries', () => {
    const counts = queuedMidTurnCounts([
      { type: QUEUE_OPERATION, operation: 'enqueue' },
      { type: QUEUE_OPERATION, operation: 'remove' },
      user('typed normally'),
    ]);
    expect(counts.size).toBe(0);
  });

  it('pairs a message that carried an image: enqueued with no content, removed with its text', () => {
    // The image is not text, so the CLI enqueues the message without a content and removes it with the words.
    const counts = queuedMidTurnCounts([{ type: QUEUE_OPERATION, operation: 'enqueue' }, op('remove', 'look at this picture')]);
    expect(counts.get('look at this picture')).toBe(1);
  });

  it('does not pair a remove with the contentless enqueue of a message accepted while idle', () => {
    const counts = queuedMidTurnCounts([{ type: QUEUE_OPERATION, operation: 'enqueue' }, { type: QUEUE_OPERATION, operation: 'dequeue' }, op('remove', 'has no enqueue of its own')]);
    expect(counts.size).toBe(0);
  });
});
