import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../getSessionEntry', () => ({ getSessionEntry: vi.fn() }));

import { announceSessionCreated } from '../announceSessionCreated';
import { nextSessionEventTs } from '../sessionsUpdated';
import { getSessionEntry } from '../getSessionEntry';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const mockEntry = vi.mocked(getSessionEntry);

/**
 * A session came to exist. The row the lists show for it is read once, here, and handed to every screen,
 * so no screen has to read its whole list to find it.
 */
describe('announceSessionCreated', () => {
  let broadcastToAll: ReturnType<typeof vi.fn>;
  let broadcastToListsHolding: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcastToAll = vi.fn();
    broadcastToListsHolding = vi.fn();
    connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;
  });

  const row = { sessionId: 's1', sessionDir: '/repo', title: 'First prompt', createdAt: 'c', lastTimestamp: 'l', messageCount: null, isSidechain: false };

  it('hands the screens whose list can hold the session its whole row, as a create', async () => {
    mockEntry.mockResolvedValue(row as never);

    await announceSessionCreated(connections, 's1', '/repo');

    expect(mockEntry).toHaveBeenCalledWith('/repo', 's1');
    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'create', session: row, ts: expect.any(Number) },
      ['/repo'],
      undefined,
    );
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('stamps the row with the time its read began, so news said while it was read still goes onto it', async () => {
    let saidWhileRead = 0;
    mockEntry.mockImplementation(async () => {
      saidWhileRead = nextSessionEventTs();
      return row as never;
    });

    await announceSessionCreated(connections, 's1', '/repo');

    const sent = broadcastToListsHolding.mock.calls[0][1] as { ts: number };
    expect(sent.ts).toBeLessThan(saidWhileRead);
  });

  it('skips the screen it is told to', async () => {
    mockEntry.mockResolvedValue(row as never);

    await announceSessionCreated(connections, 's1', '/repo', 'conn-1');

    expect(broadcastToListsHolding.mock.calls[0][3]).toBe('conn-1');
  });

  describe('a transcript that has not held a conversation yet', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is read again until it does, and handed over as soon as it does', async () => {
      mockEntry.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(row as never);

      const done = announceSessionCreated(connections, 's1', '/repo');
      await vi.advanceTimersByTimeAsync(2_000);
      await done;

      expect(mockEntry).toHaveBeenCalledTimes(3);
      expect(broadcastToListsHolding).toHaveBeenCalledTimes(1);
      expect(broadcastToListsHolding.mock.calls[0][1]).toMatchObject({ action: 'create', session: row });
    });

    it('is stamped with when the read that found the row began, not the first one', async () => {
      let first = 0;
      mockEntry.mockImplementationOnce(async () => {
        first = nextSessionEventTs();
        return null;
      });
      mockEntry.mockResolvedValueOnce(row as never);

      const done = announceSessionCreated(connections, 's1', '/repo');
      await vi.advanceTimersByTimeAsync(2_000);
      await done;

      expect((broadcastToListsHolding.mock.calls[0][1] as { ts: number }).ts).toBeGreaterThan(first);
    });

    it('is given up on after a while, so a session the lists never show is not read for ever', async () => {
      mockEntry.mockResolvedValue(null);

      const done = announceSessionCreated(connections, 's1', '/repo');
      await vi.advanceTimersByTimeAsync(60_000);
      await done;

      expect(broadcastToListsHolding).not.toHaveBeenCalled();
      expect(broadcastToAll).not.toHaveBeenCalled();
      expect(mockEntry.mock.calls.length).toBeGreaterThan(3);
      expect(mockEntry.mock.calls.length).toBeLessThan(40);
    });
  });

  it('asks every screen to read its list when the row cannot be read', async () => {
    mockEntry.mockRejectedValue(new Error('disk'));

    await announceSessionCreated(connections, 's1', '/repo');

    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh', ts: expect.any(Number) }, undefined);
  });
});
