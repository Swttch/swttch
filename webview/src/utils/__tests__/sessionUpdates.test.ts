import { describe, expect, it } from 'vitest';
import { SessionMarkDto, SessionMetaDto } from '../../dto';
import { SessionNewsJournal, applyUpdate, putNewsOnto, type SessionNews } from '../sessionUpdates';

function row(id: string, extra: Partial<SessionMetaDto> = {}): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title: `title of ${id}`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: null,
    isSidechain: false,
    ...extra,
  });
}

const update = (ts: number, sessionId: string, fields: Record<string, unknown>): SessionNews => ({ kind: 'update', ts, sessionId, fields });
const create = (ts: number, sessionId: string, row: Record<string, unknown>): SessionNews => ({ kind: 'create', ts, sessionId, row });
const remove = (ts: number, sessionId: string): SessionNews => ({ kind: 'delete', ts, sessionId });
const listed = (sessionId: string, extra: Record<string, unknown> = {}) => ({
  sessionId,
  title: `title of ${sessionId}`,
  createdAt: '2026-02-03T10:00:00Z',
  lastTimestamp: '2026-02-03T11:00:00Z',
  messageCount: null,
  isSidechain: false,
  ...extra,
});

describe('applyUpdate', () => {
  it('turns the changed items of a row and leaves the rest', () => {
    const before = row('s1');

    const after = applyUpdate(before, { title: 'new title' });

    expect(after.title).toBe('new title');
    expect(after.id).toBe('s1');
    expect(after.createdAt).toBe(before.createdAt);
    expect(after).not.toBe(before);
    expect(before.title).toBe('title of s1');
  });

  it('turns a title into the two the list gives a row: cut to fit a row, and whole', () => {
    const long = 'a'.repeat(80);

    const after = applyUpdate(row('s1'), { title: long });

    expect(after.title).toBe('a'.repeat(50));
    expect(after.fullTitle).toBe(long);
  });

  it('gives a short title as both', () => {
    const after = applyUpdate(row('s1'), { title: 'Short name' });

    expect(after.title).toBe('Short name');
    expect(after.fullTitle).toBe('Short name');
  });

  it('turns the time of last activity into the time the row is placed by', () => {
    const after = applyUpdate(row('s1'), { lastTimestamp: '2030-01-01T00:00:00.000Z' });

    expect(after.updatedAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    expect((after as unknown as Record<string, unknown>).lastTimestamp).toBeUndefined();
  });

  it('keeps the row a SessionMetaDto', () => {
    expect(applyUpdate(row('s1'), { title: 'x' })).toBeInstanceOf(SessionMetaDto);
  });

  it('makes the mark a SessionMarkDto, as the list does', () => {
    const after = applyUpdate(row('s1'), { sessionMark: { id: 's1', archivedAt: 1700 } });

    expect(after.sessionMark).toBeInstanceOf(SessionMarkDto);
    expect(after.sessionMark?.archivedAt).toBe(1700);
    expect(after.sessionMark?.desktopArchived).toBe(false);
  });
});

describe('SessionNewsJournal', () => {
  it('hands back the updates after a time, in the order of their ts', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(30, 'a', { title: 'c' }));
    journal.record(update(10, 'a', { title: 'a' }));
    journal.record(update(20, 'b', { title: 'b' }));

    expect(journal.after(10).map((u) => u.ts)).toEqual([20, 30]);
    expect(journal.after(0).map((u) => u.ts)).toEqual([10, 20, 30]);
    expect(journal.after(30)).toEqual([]);
  });

  it('keeps updates that share a ts in the order they came', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(10, 'a', { title: 'first' }));
    journal.record(update(10, 'a', { title: 'second' }));

    expect(journal.after(0).map((u) => (u as { fields: Record<string, unknown> }).fields.title)).toEqual(['first', 'second']);
  });

  it('forgets updates older than the time it keeps them for', () => {
    const journal = new SessionNewsJournal(1_000);
    journal.record(update(100, 'a', {}));
    journal.record(update(5_000, 'a', {}));

    expect(journal.after(0).map((u) => u.ts)).toEqual([5_000]);
  });

  it('keeps no more than a number of updates', () => {
    const journal = new SessionNewsJournal(1_000_000, 3);
    for (let ts = 1; ts <= 5; ts++) journal.record(update(ts, 'a', {}));

    expect(journal.after(0).map((u) => u.ts)).toEqual([3, 4, 5]);
  });
});

/**
 * A list the backend read at time T is the state of the sessions as of T. What the
 * screen shows after putting an update from before T onto it must be what it would
 * show after reading the list again, so the updates up to T are not put on again.
 */
describe('putNewsOnto', () => {
  it('puts the updates after the read onto the rows, in ts order', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(30, 's1', { title: 'third' }));
    journal.record(update(20, 's1', { title: 'second' }));

    const rows = putNewsOnto([row('s1')], 10, journal);

    expect(rows[0].title).toBe('third');
  });

  it('does not put on an update the read already holds', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(5, 's1', { title: 'old' }));

    const rows = putNewsOnto([row('s1', { title: 'newer, read at 10' })], 10, journal);

    expect(rows[0].title).toBe('newer, read at 10');
  });

  it('ignores an update for a session the read does not hold', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(20, 'elsewhere', { title: 'x' }));

    const rows = putNewsOnto([row('s1')], 10, journal);

    expect(rows.map((r) => r.id)).toEqual(['s1']);
    expect(rows[0].title).toBe('title of s1');
  });

  it('puts a row created after the read into the rows, which the read could not hold', () => {
    const journal = new SessionNewsJournal();
    journal.record(create(30, 's2', listed('s2')));

    const rows = putNewsOnto([row('s1')], 10, journal);

    expect(rows.map((r) => r.id)).toEqual(['s1', 's2']);
    expect(rows[1]).toBeInstanceOf(SessionMetaDto);
    expect(rows[1].title).toBe('title of s2');
  });

  it('does not put a row onto a read that was made after it was created', () => {
    const journal = new SessionNewsJournal();
    journal.record(create(30, 's2', listed('s2')));

    const rows = putNewsOnto([row('s1')], 40, journal);

    expect(rows.map((r) => r.id)).toEqual(['s1']);
  });

  it('takes out a row that was deleted after the read', () => {
    const journal = new SessionNewsJournal();
    journal.record(remove(30, 's1'));

    const rows = putNewsOnto([row('s1'), row('s2')], 10, journal);

    expect(rows.map((r) => r.id)).toEqual(['s2']);
  });

  it('puts an update after the row it follows, when the row was created in the same stretch', () => {
    const journal = new SessionNewsJournal();
    journal.record(update(40, 's2', { title: 'renamed' }));
    journal.record(create(30, 's2', listed('s2')));

    const rows = putNewsOnto([], 10, journal);

    expect(rows.map((r) => [r.id, r.title])).toEqual([['s2', 'renamed']]);
  });

  it('hands back the same rows when there is nothing to put on', () => {
    const rows = [row('s1')];

    expect(putNewsOnto(rows, 10, new SessionNewsJournal())).toBe(rows);
  });
});

/**
 * What the screen settles on must be what reading the list again would show. The
 * backend's state is a run of changes; the list read at time T holds the changes up to T.
 * However the read and the updates are interleaved, the result must be the same.
 */
describe('the screen agrees with a read of the list', () => {
  // The truth: one title that changes at ts 10, 20 and 30.
  const changes = [
    update(10, 's1', { title: 'A' }),
    update(20, 's1', { title: 'B' }),
    update(30, 's1', { title: 'C' }),
  ];
  const titleAt = (ts: number) => {
    const latest = [...changes].reverse().find((c) => c.ts <= ts);
    return latest?.kind === 'update' ? latest.fields.title : 'start';
  };

  it.each([0, 10, 15, 20, 25, 30, 35])('for a list read at %i, however late the updates arrive', (readAt) => {
    // The list holds the title as of readAt.
    const read = [row('s1', { title: titleAt(readAt) as string })];

    // The updates reached the screen before the list did, in order.
    const journal = new SessionNewsJournal();
    changes.forEach((c) => journal.record(c));

    const shown = putNewsOnto(read, readAt, journal);

    expect(shown[0].title).toBe('C');
  });
});
