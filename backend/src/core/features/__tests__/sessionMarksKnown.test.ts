import { beforeEach, describe, expect, it } from 'vitest';
import { noteSentMark, resetKnownMarks, seedKnownMarks, takeMarkChanges } from '../sessionMarksKnown';
import type { SessionMark } from '../sessionMarks';

const mark = (row: Record<string, unknown>) => ({ row, sessionId: String(row.id) }) as unknown as SessionMark;
const marks = (...rows: Array<Record<string, unknown>>) => new Map(rows.map((row) => [String(row.id), mark(row)]));

/**
 * The marks the screens were last told of, so that when the table changes the screens are told
 * about the sessions whose mark differs, and about no others.
 */
describe('the marks the screens know', () => {
  beforeEach(() => resetKnownMarks());

  it('says nothing could be compared before it knows any, and learns the marks from that ask', () => {
    expect(takeMarkChanges(marks({ id: 'a', archivedAt: 0 }))).toBeNull();

    expect(takeMarkChanges(marks({ id: 'a', archivedAt: 0 }))).toEqual([]);
  });

  it('hands back only the sessions whose mark changed since the last ask', () => {
    seedKnownMarks(marks({ id: 'a', archivedAt: 0 }, { id: 'b', archivedAt: 0 }));

    const changes = takeMarkChanges(marks({ id: 'a', archivedAt: 1700 }, { id: 'b', archivedAt: 0 }));

    expect(changes?.map((c) => [c.sessionId, c.mark?.row])).toEqual([['a', { id: 'a', archivedAt: 1700 }]]);
    expect(takeMarkChanges(marks({ id: 'a', archivedAt: 1700 }, { id: 'b', archivedAt: 0 }))).toEqual([]);
  });

  it('hands back a session that has a mark now and had none', () => {
    seedKnownMarks(marks());

    const changes = takeMarkChanges(marks({ id: 'new', parentSessionUid: 'p' }));

    expect(changes?.map((c) => c.sessionId)).toEqual(['new']);
  });

  it('hands back a session whose mark is gone, with no mark', () => {
    seedKnownMarks(marks({ id: 'a', archivedAt: 5 }));

    const changes = takeMarkChanges(marks());

    expect(changes).toEqual([{ sessionId: 'a', mark: null }]);
  });

  it('does not hand back a mark the screens were already told, however it came to be told', () => {
    seedKnownMarks(marks({ id: 'a', archivedAt: 0 }));

    noteSentMark('a', mark({ id: 'a', archivedAt: 1700 }));

    expect(takeMarkChanges(marks({ id: 'a', archivedAt: 1700 }))).toEqual([]);
  });

  it('counts a mark the screens were told of as gone when it was told as none', () => {
    seedKnownMarks(marks({ id: 'a', archivedAt: 5 }));

    noteSentMark('a', undefined);

    expect(takeMarkChanges(marks())).toEqual([]);
  });
});
