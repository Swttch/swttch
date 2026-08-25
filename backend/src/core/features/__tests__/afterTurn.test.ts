/**
 * Messages held until a turn ends.
 *
 * The reason this exists is measured, not assumed: the CLI enqueues a user
 * message that arrives mid-turn and then REMOVES it as the turn finishes, so
 * anything sent alongside a permission answer is discarded. The edit notice
 * went enqueue → remove in 183ms while the same session's ordinary message went
 * enqueue → dequeue, and the model never read it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendAfterTurn,
  takeMessagesForFinishedTurn,
  clearMessagesForSession,
  clearAllPendingMessages,
} from '../afterTurn';

beforeEach(() => clearAllPendingMessages());

describe('holding a message for the end of a turn', () => {
  it('hands it back when the turn is reported finished', () => {
    sendAfterTurn('sess-1', 'notice');

    expect(takeMessagesForFinishedTurn('sess-1')).toEqual(['notice']);
  });

  it('hands back nothing for a session that queued nothing', () => {
    // Every turn end asks, and almost none of them have anything waiting.
    expect(takeMessagesForFinishedTurn('sess-quiet')).toEqual([]);
  });

  it('hands each message back once', () => {
    // The queue is drained, not read: a notice delivered twice would have the
    // model correct itself a second time for an edit it already knows about.
    sendAfterTurn('sess-1', 'notice');
    takeMessagesForFinishedTurn('sess-1');

    expect(takeMessagesForFinishedTurn('sess-1')).toEqual([]);
  });

  it('keeps the order they were queued in', () => {
    // Two answers in one turn — a diff resolved twice before the CLI reports
    // back — read in the order the reviewer gave them.
    sendAfterTurn('sess-1', 'first');
    sendAfterTurn('sess-1', 'second');

    expect(takeMessagesForFinishedTurn('sess-1')).toEqual(['first', 'second']);
  });

  it('keeps sessions apart', () => {
    // Two reviews in two sessions at once: one turn ending must not deliver the
    // other session's notice into it.
    sendAfterTurn('sess-1', 'for one');
    sendAfterTurn('sess-2', 'for two');

    expect(takeMessagesForFinishedTurn('sess-1')).toEqual(['for one']);
    expect(takeMessagesForFinishedTurn('sess-2')).toEqual(['for two']);
  });

  it('drops what a dead session was holding', () => {
    // No turn will ever end for it. Kept, the notice would surface in whatever
    // session reuses the id — a correction about an edit made somewhere else.
    sendAfterTurn('sess-1', 'notice');

    clearMessagesForSession('sess-1');

    expect(takeMessagesForFinishedTurn('sess-1')).toEqual([]);
  });
});
