import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../getSessionEntry', () => ({ getSessionEntry: vi.fn() }));

import { announceSessionCreated } from '../announceSessionCreated';
import { getSessionEntry } from '../getSessionEntry';
import { nextSessionEventTs } from '../sessionsUpdated';
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

  it('says nothing for a session the lists do not show', async () => {
    mockEntry.mockResolvedValue(null);

    await announceSessionCreated(connections, 's1', '/repo');

    expect(broadcastToListsHolding).not.toHaveBeenCalled();
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('asks every screen to read its list when the row cannot be read', async () => {
    mockEntry.mockRejectedValue(new Error('disk'));

    await announceSessionCreated(connections, 's1', '/repo');

    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh', ts: expect.any(Number) }, undefined);
  });
});
