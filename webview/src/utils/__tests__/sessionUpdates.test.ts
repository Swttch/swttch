import { describe, expect, it } from 'vitest';
import { SessionMarkDto, SessionMetaDto } from '../../dto';
import { SessionUpdateJournal, applyUpdate, putUpdatesOnto, type SessionUpdate } from '../sessionUpdates';

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

const update = (ts: number, sessionId: string, fields: Record<string, unknown>): SessionUpdate => ({ ts, sessionId, fields });

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

describe('SessionUpdateJournal', () => {
  it('hands back the updates after a time, in the order of their ts', () => {
    const journal = new SessionUpdateJournal();
    journal.record(update(30, 'a', { title: 'c' }));
    journal.record(update(10, 'a', { title: 'a' }));
    journal.record(update(20, 'b', { title: 'b' }));

    expect(journal.after(10).map((u) => u.ts)).toEqual([20, 30]);
    expect(journal.after(0).map((u) => u.ts)).toEqual([10, 20, 30]);
    expect(journal.after(30)).toEqual([]);
  });

  it('keeps updates that share a ts in the order they came', () => {
    const journal = new SessionUpdateJournal();
    journal.record(update(10, 'a', { title: 'first' }));
    journal.record(update(10, 'a', { title: 'second' }));

    expect(journal.after(0).map((u) => u.fields.title)).toEqual(['first', 'second']);
  });

  it('forgets updates older than the time it keeps them for', () => {
    const journal = new SessionUpdateJournal(1_000);
    journal.record(update(100, 'a', {}));
    journal.record(update(5_000, 'a', {}));

    expect(journal.after(0).map((u) => u.ts)).toEqual([5_000]);
  });

  it('keeps no more than a number of updates', () => {
    const journal = new SessionUpdateJournal(1_000_000, 3);
    for (let ts = 1; ts <= 5; ts++) journal.record(update(ts, 'a', {}));

    expect(journal.after(0).map((u) => u.ts)).toEqual([3, 4, 5]);
  });
});

/**
 * A list the backend read at time T is the state of the sessions as of T. What the
 * screen shows after putting an update from before T onto it must be what it would
 * show after reading the list again, so the updates up to T are not put on again.
 */
describe('putUpdatesOnto', () => {
  it('puts the updates after the read onto the rows, in ts order', () => {
    const journal = new SessionUpdateJournal();
    journal.record(update(30, 's1', { title: 'third' }));
    journal.record(update(20, 's1', { title: 'second' }));

    const rows = putUpdatesOnto([row('s1')], 10, journal);

    expect(rows[0].title).toBe('third');
  });

  it('does not put on an update the read already holds', () => {
    const journal = new SessionUpdateJournal();
    journal.record(update(5, 's1', { title: 'old' }));

    const rows = putUpdatesOnto([row('s1', { title: 'newer, read at 10' })], 10, journal);

    expect(rows[0].title).toBe('newer, read at 10');
  });

  it('ignores an update for a session the read does not hold', () => {
    const journal = new SessionUpdateJournal();
    journal.record(update(20, 'elsewhere', { title: 'x' }));

    const rows = putUpdatesOnto([row('s1')], 10, journal);

    expect(rows.map((r) => r.id)).toEqual(['s1']);
    expect(rows[0].title).toBe('title of s1');
  });

  it('hands back the same rows when there is nothing to put on', () => {
    const rows = [row('s1')];

    expect(putUpdatesOnto(rows, 10, new SessionUpdateJournal())).toBe(rows);
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
  const titleAt = (ts: number) => [...changes].reverse().find((c) => c.ts <= ts)?.fields.title ?? 'start';

  it.each([0, 10, 15, 20, 25, 30, 35])('for a list read at %i, however late the updates arrive', (readAt) => {
    // The list holds the title as of readAt.
    const read = [row('s1', { title: titleAt(readAt) as string })];

    // The updates reached the screen before the list did, in order.
    const journal = new SessionUpdateJournal();
    changes.forEach((c) => journal.record(c));

    const shown = putUpdatesOnto(read, readAt, journal);

    expect(shown[0].title).toBe('C');
  });
});
