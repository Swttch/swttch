import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sessionMarks', () => ({ readSessionMarksToShow: vi.fn() }));

import { announceSessionRequested, announceSessionStarting, dropSessionPlaceholder, placeholderSessionId } from '../announceSessionStarting';
import { readSessionMarksToShow, type SessionMark } from '../sessionMarks';
import { resetKnownMarks, seedKnownMarks, takeMarkChanges } from '../sessionMarksKnown';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const mockMarks = vi.mocked(readSessionMarksToShow);
const markOf = (row: Record<string, unknown>) => ({ row, sessionId: String(row.id) }) as unknown as SessionMark;

/**
 * A session was started and its transcript does not exist yet, which can take the CLI many seconds. The
 * screens are told at once, with a row made of what is known (a `provisional` one), so the session is in
 * the list while it starts. The row the transcript gives replaces it when the file is there.
 */
describe('announceSessionStarting', () => {
  let broadcastToListsHolding: ReturnType<typeof vi.fn>;
  let broadcastToAll: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetKnownMarks();
    broadcastToListsHolding = vi.fn();
    broadcastToAll = vi.fn();
    connections = { broadcastToListsHolding, broadcastToAll } as unknown as ConnectionManager;
    mockMarks.mockResolvedValue(new Map());
  });

  it('hands the screens whose list can hold the session a provisional row, as a create', async () => {
    const startedAt = Date.UTC(2026, 10, 15, 13, 0, 0);
    mockMarks.mockResolvedValue(new Map([['child', markOf({ id: 'child', parentSessionUid: 'parent', startedAt })]]));

    await announceSessionStarting(connections, { sessionId: 'child', cwd: '/work' }, '* Review env');

    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      {
        action: 'create',
        session: {
          sessionId: 'child',
          sessionDir: '/work',
          title: '* Review env',
          createdAt: '2026-11-15T13:00:00.000Z',
          lastTimestamp: '2026-11-15T13:00:00.000Z',
          messageCount: null,
          isSidechain: false,
          sessionMark: { id: 'child', parentSessionUid: 'parent', startedAt },
          provisional: true,
        },
        ts: expect.any(Number),
      },
      ['/work'],
      undefined,
    );
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('still hands over a row when no mark is kept for the session, with the time it is now', async () => {
    await announceSessionStarting(connections, { sessionId: 'child', cwd: '/work' }, 'Name');

    const row = (broadcastToListsHolding.mock.calls[0][1] as { session: Record<string, unknown> }).session;
    expect(row).toMatchObject({ sessionId: 'child', title: 'Name', provisional: true });
    expect(row).not.toHaveProperty('sessionMark');
    expect(typeof row.createdAt).toBe('string');
  });

  it('falls back on the title in the mark, and then on none', async () => {
    mockMarks.mockResolvedValue(new Map([['child', markOf({ id: 'child', title: 'From the mark', startedAt: 1 })]]));

    await announceSessionStarting(connections, { sessionId: 'child', cwd: '/work' }, undefined);

    expect((broadcastToListsHolding.mock.calls[0][1] as { session: { title: string } }).session.title).toBe('From the mark');
  });

  it('notes the mark it handed over, so the watching of the marks does not tell it again', async () => {
    seedKnownMarks(new Map());
    mockMarks.mockResolvedValue(new Map([['child', markOf({ id: 'child', startedAt: 1 })]]));

    await announceSessionStarting(connections, { sessionId: 'child', cwd: '/work' }, 'T');

    expect(takeMarkChanges(new Map([['child', markOf({ id: 'child', startedAt: 1 })]]))).toEqual([]);
  });

  it('still hands over a row when the marks cannot be read', async () => {
    mockMarks.mockRejectedValue(new Error('disk'));

    await announceSessionStarting(connections, { sessionId: 'child', cwd: '/work' }, 'T');

    expect(broadcastToListsHolding).toHaveBeenCalledTimes(1);
  });
});

/**
 * A session is being started and the call that starts it has not been answered, so the session has no id yet. The
 * screens are given a row made of the call under an id of its own, which the answer replaces.
 */
describe('announceSessionRequested', () => {
  let broadcastToListsHolding: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcastToListsHolding = vi.fn();
    connections = { broadcastToListsHolding, broadcastToAll: vi.fn() } as unknown as ConnectionManager;
  });

  it('names its placeholder so that no id the CLI gives can be taken for it', () => {
    expect(placeholderSessionId('toolu_1')).toBe('starting:toolu_1');
  });

  it('hands the screens whose list can hold the session a provisional row under the session that started it', () => {
    announceSessionRequested(connections, { placeholderId: 'starting:toolu_1', cwd: '/work', title: '* Review env', startedBy: 'parent' });

    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      {
        action: 'create',
        session: expect.objectContaining({
          sessionId: 'starting:toolu_1',
          sessionDir: '/work',
          title: '* Review env',
          provisional: true,
          sessionMark: expect.objectContaining({ id: 'starting:toolu_1', parentSessionUid: 'parent', archivedAt: 0, desktopArchived: false }),
        }),
        ts: expect.any(Number),
      },
      ['/work'],
      undefined,
    );
  });

  it('is put under nothing when nothing says who started it', () => {
    announceSessionRequested(connections, { placeholderId: 'starting:toolu_1', cwd: '/work', title: 'x' });

    const session = broadcastToListsHolding.mock.calls[0][1].session;
    expect(session.sessionMark.parentSessionUid).toBeNull();
  });

  it('is taken away as a delete of that id', () => {
    dropSessionPlaceholder(connections, { placeholderId: 'starting:toolu_1', cwd: '/work' });

    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'delete', session: { sessionId: 'starting:toolu_1' }, ts: expect.any(Number) },
      ['/work'],
      undefined,
    );
  });
});
