import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceSessionsUpdated, nextSessionEventTs, resetSessionEventClock, sessionNewsCount } from '../sessionsUpdated';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

/**
 * Every session news carries `ts`, the number that says where it stands among
 * the others. The screens put the news in that order, so two things must hold:
 * no two news share a number, and the numbers never go back.
 */
describe('nextSessionEventTs', () => {
  beforeEach(() => {
    resetSessionEventClock();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('follows the clock', () => {
    vi.setSystemTime(1_000);
    expect(nextSessionEventTs()).toBe(1_000);
    vi.setSystemTime(2_500);
    expect(nextSessionEventTs()).toBe(2_500);
  });

  it('never repeats a number, even for news in the same millisecond', () => {
    vi.setSystemTime(1_000);
    expect([nextSessionEventTs(), nextSessionEventTs(), nextSessionEventTs()]).toEqual([1_000, 1_001, 1_002]);
  });

  it('never goes back when the clock does', () => {
    vi.setSystemTime(5_000);
    expect(nextSessionEventTs()).toBe(5_000);
    vi.setSystemTime(1_000);
    expect(nextSessionEventTs()).toBe(5_001);
  });
});

describe('sessionNewsCount', () => {
  beforeEach(() => resetSessionEventClock());

  it('rises with each piece of news announced', () => {
    const connections = { broadcastToAll: vi.fn() } as unknown as ConnectionManager;
    const before = sessionNewsCount();

    announceSessionsUpdated(connections, { action: 'refresh' });
    announceSessionsUpdated(connections, { action: 'update', session: { sessionId: 's1' } });

    expect(sessionNewsCount()).toBe(before + 2);
  });

  it('does not rise when a number is only taken for a read', () => {
    const before = sessionNewsCount();

    nextSessionEventTs();
    nextSessionEventTs();

    expect(sessionNewsCount()).toBe(before);
  });
});

describe('announceSessionsUpdated', () => {
  beforeEach(() => resetSessionEventClock());

  it('tells every connection the news with its ts, and returns that ts', () => {
    const broadcastToAll = vi.fn();
    const connections = { broadcastToAll } as unknown as ConnectionManager;

    const ts = announceSessionsUpdated(connections, { action: 'update', session: { sessionId: 's1', title: 'T' } });

    expect(typeof ts).toBe('number');
    expect(broadcastToAll).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'update', session: { sessionId: 's1', title: 'T' }, ts },
      undefined,
    );
  });

  it('skips the connection it is told to', () => {
    const broadcastToAll = vi.fn();
    const connections = { broadcastToAll } as unknown as ConnectionManager;

    announceSessionsUpdated(connections, { action: 'create' }, { exceptConnectionId: 'conn-1' });

    expect(broadcastToAll.mock.calls[0][2]).toBe('conn-1');
  });

  it('sends news about a session only to the screens whose list can hold it, when it is told where the session lives', () => {
    const broadcastToAll = vi.fn();
    const broadcastToListsHolding = vi.fn();
    const connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;

    const ts = announceSessionsUpdated(
      connections,
      { action: 'update', session: { sessionId: 's1' } },
      { sessionDirs: ['/repo'], exceptConnectionId: 'conn-1' },
    );

    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'update', session: { sessionId: 's1' }, ts },
      ['/repo'],
      'conn-1',
    );
  });

  it('sends to every screen when the folders of the session are empty', () => {
    const broadcastToAll = vi.fn();
    const broadcastToListsHolding = vi.fn();
    const connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;

    announceSessionsUpdated(connections, { action: 'update' }, { sessionDirs: ['', ''] });

    expect(broadcastToListsHolding).not.toHaveBeenCalled();
    expect(broadcastToAll).toHaveBeenCalledTimes(1);
  });

  it('gives news sent one after another rising numbers', () => {
    const broadcastToAll = vi.fn();
    const connections = { broadcastToAll } as unknown as ConnectionManager;

    const a = announceSessionsUpdated(connections, { action: 'refresh' });
    const b = announceSessionsUpdated(connections, { action: 'refresh' });

    expect(b).toBeGreaterThan(a);
  });
});
