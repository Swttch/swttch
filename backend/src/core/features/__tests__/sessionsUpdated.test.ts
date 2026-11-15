import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceSessionsUpdated, nextSessionEventTs, resetSessionEventClock } from '../sessionsUpdated';
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

    announceSessionsUpdated(connections, { action: 'started' }, 'conn-1');

    expect(broadcastToAll.mock.calls[0][2]).toBe('conn-1');
  });

  it('gives news sent one after another rising numbers', () => {
    const broadcastToAll = vi.fn();
    const connections = { broadcastToAll } as unknown as ConnectionManager;

    const a = announceSessionsUpdated(connections, { action: 'refresh' });
    const b = announceSessionsUpdated(connections, { action: 'refresh' });

    expect(b).toBeGreaterThan(a);
  });
});
