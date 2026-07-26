import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the process bridge: the scheduler must call sendMessageToProcess on fire,
// but we never spawn a real CLI here.
const sendMessageToProcess = vi.fn((..._args: unknown[]) => true);
vi.mock('../../claude-process', () => ({
  sendMessageToProcess: (...args: unknown[]) => sendMessageToProcess(...args),
}));

// Mock the persistence layer with an in-memory store. This keeps the scheduler a
// pure unit test (no real fs) so fake-timer advances deterministically flush the
// engine's async work — the on-disk store has its own dedicated test.
const memStore = new Map<string, ScheduledMessage[]>();
vi.mock('../scheduled-messages-store', () => ({
  addSchedule: vi.fn(async (msg: ScheduledMessage) => {
    const list = memStore.get(msg.sessionId) ?? [];
    list.push(msg);
    memStore.set(msg.sessionId, list);
  }),
  removeSchedule: vi.fn(async (sessionId: string, id: string) => {
    const list = memStore.get(sessionId);
    if (!list) return;
    const next = list.filter((m) => m.id !== id);
    if (next.length === 0) memStore.delete(sessionId);
    else memStore.set(sessionId, next);
  }),
  readSchedulesForSession: vi.fn(async (sessionId: string) => memStore.get(sessionId) ?? []),
}));

import {
  registerTimer,
  scheduleMessage,
  cancelSchedule,
  restoreSchedulesForSession,
  registerHook,
  resetSchedulerForTest,
  type ScheduleHook,
} from '../scheduled-messages';
import { addSchedule, readSchedulesForSession } from '../scheduled-messages-store';
import { ScheduledMessageKind, type ScheduledMessage } from '../../../shared';

// Minimal ConnectionManager stand-in: only broadcastToSession is exercised.
function makeConnections() {
  return { broadcastToSession: vi.fn() };
}

function makeMsg(id: string, sendAtOffsetMs: number): ScheduledMessage {
  return {
    id,
    sessionId: 'sess-a',
    sendAt: new Date(Date.now() + sendAtOffsetMs).toISOString(),
    message: 'continue',
    kind: ScheduledMessageKind.AUTO_RESUME,
    createdAt: new Date().toISOString(),
  };
}

describe('scheduled-messages scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMessageToProcess.mockClear();
    memStore.clear();
    resetSchedulerForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetSchedulerForTest();
    memStore.clear();
  });

  it('fires at sendAt: runs the pre-send hook, sends, removes, and broadcasts on proceed', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 60_000);

    await scheduleMessage(msg, connections as unknown as never);
    // The create itself broadcasts once.
    expect(connections.broadcastToSession).toHaveBeenCalledTimes(1);
    connections.broadcastToSession.mockClear();

    // Not yet due.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(sendMessageToProcess).not.toHaveBeenCalled();

    // Cross the deadline.
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
    expect(sendMessageToProcess).toHaveBeenCalledWith(connections, 'sess-a', 'continue');
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
    expect(connections.broadcastToSession).toHaveBeenCalled();
  });

  it('does not send and keeps the reservation when the hook returns proceed:false, done:false', async () => {
    const connections = makeConnections();
    const waitingHook: ScheduleHook = vi.fn(async () => ({ proceed: false, done: false }));
    registerHook(ScheduledMessageKind.AUTO_RESUME, waitingHook);

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(waitingHook).toHaveBeenCalledWith(msg);
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    // Still persisted — the hook owns the retry.
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('removes and broadcasts without sending when the hook gives up (proceed:false, done:true)', async () => {
    const connections = makeConnections();
    registerHook(ScheduledMessageKind.AUTO_RESUME, async () => ({ proceed: false, done: true }));

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);
    connections.broadcastToSession.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
    expect(connections.broadcastToSession).toHaveBeenCalled();
  });

  it('treats a throwing hook as give-up: no send, reservation removed', async () => {
    const connections = makeConnections();
    registerHook(ScheduledMessageKind.AUTO_RESUME, async () => {
      throw new Error('hook boom');
    });

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
  });

  it('fires immediately (next tick) when sendAt is already in the past', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', -5_000); // 5s ago
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
  });

  it('cancelSchedule clears the timer so it never fires, and removes from the store', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 10_000);
    await scheduleMessage(msg, connections as unknown as never);

    await cancelSchedule('sess-a', 'r1', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
  });

  it('restoreSchedulesForSession re-registers timers from the store', async () => {
    const connections = makeConnections();
    // Persist directly (simulates a reservation that survived a backend restart).
    await addSchedule(makeMsg('r1', 5_000));

    await restoreSchedulesForSession('sess-a', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
  });

  it('restore does not double-register an already-registered timer', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 5_000);
    await scheduleMessage(msg, connections as unknown as never);

    // A second restore pass must not create a duplicate timer.
    await restoreSchedulesForSession('sess-a', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
  });

  it('registerTimer honors an explicitly passed hook over the registry default', async () => {
    const connections = makeConnections();
    const explicit: ScheduleHook = vi.fn(async () => ({ proceed: false, done: true }));
    const msg = makeMsg('r1', 1_000);
    await addSchedule(msg);

    registerTimer(msg, explicit, connections as unknown as never);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(explicit).toHaveBeenCalledWith(msg);
    expect(sendMessageToProcess).not.toHaveBeenCalled();
  });
});
