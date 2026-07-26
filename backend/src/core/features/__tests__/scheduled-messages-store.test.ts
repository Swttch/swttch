import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// The store derives its base dir from os.homedir(). Point it at a throwaway temp
// dir so the tests touch real files without hitting the user's home.
let tempHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => tempHome };
});

import {
  readAllSchedules,
  readSchedulesForSession,
  addSchedule,
  removeSchedule,
  removeSchedulesForSession,
  updateSchedule,
} from '../scheduled-messages-store';
import { ScheduledMessageKind, type ScheduledMessage } from '../../../shared';

function makeMsg(sessionId: string, id: string, sendAt = '2030-01-01T00:00:00.000Z'): ScheduledMessage {
  return {
    id,
    sessionId,
    sendAt,
    message: 'continue',
    kind: ScheduledMessageKind.AUTO_RESUME,
    createdAt: '2029-12-31T00:00:00.000Z',
  };
}

describe('scheduled-messages-store', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sched-store-'));
  });
  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('returns an empty map when nothing is saved', async () => {
    expect(await readAllSchedules()).toEqual({});
  });

  it('returns an empty array for a session with no reservations', async () => {
    expect(await readSchedulesForSession('sess-x')).toEqual([]);
  });

  it('adds and reads back a reservation for a session', async () => {
    const msg = makeMsg('sess-a', 'r1');
    await addSchedule(msg);
    expect(await readSchedulesForSession('sess-a')).toEqual([msg]);
    expect(await readAllSchedules()).toEqual({ 'sess-a': [msg] });
  });

  it('preserves the entry structure verbatim (no field renaming/editing)', async () => {
    const msg = makeMsg('sess-a', 'r1');
    await addSchedule(msg);
    const [read] = await readSchedulesForSession('sess-a');
    expect(read).toEqual(msg);
    expect(Object.keys(read).sort()).toEqual(
      ['createdAt', 'id', 'kind', 'message', 'sendAt', 'sessionId'].sort(),
    );
  });

  it('keeps multiple reservations per session independent', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await addSchedule(makeMsg('sess-a', 'r2'));
    const list = await readSchedulesForSession('sess-a');
    expect(list.map((m) => m.id).sort()).toEqual(['r1', 'r2']);
  });

  it('isolates reservations between sessions', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await addSchedule(makeMsg('sess-b', 'r2'));
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
    expect((await readSchedulesForSession('sess-b')).map((m) => m.id)).toEqual(['r2']);
  });

  it('removeSchedule removes only the one reservation by id', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await addSchedule(makeMsg('sess-a', 'r2'));
    await removeSchedule('sess-a', 'r1');
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r2']);
  });

  it('removeSchedule drops the session key when its last reservation is removed', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await removeSchedule('sess-a', 'r1');
    expect(await readAllSchedules()).toEqual({});
  });

  it('removeSchedulesForSession clears every reservation for that session only', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await addSchedule(makeMsg('sess-a', 'r2'));
    await addSchedule(makeMsg('sess-b', 'r3'));
    await removeSchedulesForSession('sess-a');
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
    expect((await readSchedulesForSession('sess-b')).map((m) => m.id)).toEqual(['r3']);
  });

  it('removing a non-existent reservation is a no-op', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    await removeSchedule('sess-a', 'nope');
    await removeSchedule('sess-nope', 'r1');
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('survives a corrupt store file by falling back to empty', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    const storeFile = join(tempHome, '.claude-code-gui', 'scheduled-messages.json');
    await writeFile(storeFile, '{not json', 'utf-8');
    expect(await readAllSchedules()).toEqual({});
    // A subsequent add recovers cleanly on top of the reset.
    await addSchedule(makeMsg('sess-b', 'r2'));
    expect((await readSchedulesForSession('sess-b')).map((m) => m.id)).toEqual(['r2']);
  });

  it('persists to ~/.claude-code-gui/scheduled-messages.json', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    const storeFile = join(tempHome, '.claude-code-gui', 'scheduled-messages.json');
    const raw = JSON.parse(await readFile(storeFile, 'utf-8'));
    expect(raw['sess-a'][0].id).toBe('r1');
  });

  it('updateSchedule patches message and sendAt in place, preserving other fields', async () => {
    await addSchedule(makeMsg('sess-a', 'r1', '2030-01-01T00:00:00.000Z'));
    const updated = await updateSchedule('sess-a', 'r1', {
      message: 'edited',
      sendAt: '2031-02-02T02:02:00.000Z',
    });
    expect(updated).toMatchObject({
      id: 'r1',
      message: 'edited',
      sendAt: '2031-02-02T02:02:00.000Z',
      kind: ScheduledMessageKind.AUTO_RESUME,
    });
    // Persisted.
    const [row] = await readSchedulesForSession('sess-a');
    expect(row.message).toBe('edited');
    expect(row.sendAt).toBe('2031-02-02T02:02:00.000Z');
  });

  it('updateSchedule returns null for an unknown id or session', async () => {
    await addSchedule(makeMsg('sess-a', 'r1'));
    expect(await updateSchedule('sess-a', 'nope', { message: 'x' })).toBeNull();
    expect(await updateSchedule('sess-nope', 'r1', { message: 'x' })).toBeNull();
    // The original is untouched.
    expect((await readSchedulesForSession('sess-a'))[0].message).not.toBe('x');
  });
});
