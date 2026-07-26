import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { MessageType, ScheduledMessageKind, type ScheduledMessage } from '../../../shared';

// Minimal ConnectionManager stand-in. Delivery no longer touches the CLI stdin;
// on proceed the engine picks a tab (pickScheduledDeliveryTarget) and pushes to
// it (sendTo). By default a live tab is available and needs no session switch.
function makeConnections(
  target: { connectionId: string; needsSessionSwitch: boolean } | null = {
    connectionId: 'conn-1',
    needsSessionSwitch: false,
  },
) {
  return {
    broadcastToSession: vi.fn(),
    sendTo: vi.fn(),
    pickScheduledDeliveryTarget: vi.fn(() => target),
  };
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
    memStore.clear();
    resetSchedulerForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetSchedulerForTest();
    memStore.clear();
  });

  it('fires at sendAt: pushes DELIVER_SCHEDULED_MESSAGE to the chosen tab and KEEPS the reservation (until its ACK)', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 60_000);

    await scheduleMessage(msg, connections as unknown as never);
    connections.broadcastToSession.mockClear();

    // Not yet due.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(connections.sendTo).not.toHaveBeenCalled();

    // Cross the deadline.
    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.pickScheduledDeliveryTarget).toHaveBeenCalledWith('sess-a', undefined);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.DELIVER_SCHEDULED_MESSAGE, {
      id: 'r1',
      sessionId: 'sess-a',
      message: 'continue',
      needsSessionSwitch: false,
    });
    // Reservation is NOT removed here — it lives until the tab ACKs delivery.
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('prefers the reservation panelId as the delivery-target key', async () => {
    const connections = makeConnections();
    const msg = { ...makeMsg('r1', 1_000), panelId: 'panel-xyz' };
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.pickScheduledDeliveryTarget).toHaveBeenCalledWith('sess-a', 'panel-xyz');
  });

  it('passes needsSessionSwitch through to the push when the target requires it', async () => {
    const connections = makeConnections({ connectionId: 'conn-9', needsSessionSwitch: true });
    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-9', MessageType.DELIVER_SCHEDULED_MESSAGE, {
      id: 'r1',
      sessionId: 'sess-a',
      message: 'continue',
      needsSessionSwitch: true,
    });
  });

  it('no live tab: does not push and keeps the reservation for the next attach', async () => {
    const connections = makeConnections(null); // no eligible tab
    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.sendTo).not.toHaveBeenCalled();
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('does not push and keeps the reservation when the hook returns proceed:false, done:false', async () => {
    const connections = makeConnections();
    const waitingHook: ScheduleHook = vi.fn(async () => ({ proceed: false, done: false }));
    registerHook(ScheduledMessageKind.AUTO_RESUME, waitingHook);

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(waitingHook).toHaveBeenCalledWith(msg);
    expect(connections.sendTo).not.toHaveBeenCalled();
    // Still persisted — the hook owns the retry.
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('removes and broadcasts without pushing when the hook gives up (proceed:false, done:true)', async () => {
    const connections = makeConnections();
    registerHook(ScheduledMessageKind.AUTO_RESUME, async () => ({ proceed: false, done: true }));

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);
    connections.broadcastToSession.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.sendTo).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
    expect(connections.broadcastToSession).toHaveBeenCalled();
  });

  it('treats a throwing hook as give-up: no push, reservation removed', async () => {
    const connections = makeConnections();
    registerHook(ScheduledMessageKind.AUTO_RESUME, async () => {
      throw new Error('hook boom');
    });

    const msg = makeMsg('r1', 1_000);
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(connections.sendTo).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
  });

  it('fires immediately (next tick) when sendAt is already in the past', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', -5_000); // 5s ago
    await scheduleMessage(msg, connections as unknown as never);

    await vi.advanceTimersByTimeAsync(0);

    expect(connections.sendTo).toHaveBeenCalledTimes(1);
  });

  it('cancelSchedule clears the timer so it never fires, and removes from the store', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 10_000);
    await scheduleMessage(msg, connections as unknown as never);

    await cancelSchedule('sess-a', 'r1', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(connections.sendTo).not.toHaveBeenCalled();
    expect(await readSchedulesForSession('sess-a')).toEqual([]);
  });

  it('restoreSchedulesForSession re-registers timers from the store', async () => {
    const connections = makeConnections();
    // Persist directly (simulates a reservation that survived a backend restart).
    await addSchedule(makeMsg('r1', 5_000));

    await restoreSchedulesForSession('sess-a', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(connections.sendTo).toHaveBeenCalledTimes(1);
    // Kept until ACK (delivery is at-least-once).
    expect((await readSchedulesForSession('sess-a')).map((m) => m.id)).toEqual(['r1']);
  });

  it('restore does not double-register an already-registered timer', async () => {
    const connections = makeConnections();
    const msg = makeMsg('r1', 5_000);
    await scheduleMessage(msg, connections as unknown as never);

    // A second restore pass must not create a duplicate timer.
    await restoreSchedulesForSession('sess-a', connections as unknown as never);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(connections.sendTo).toHaveBeenCalledTimes(1);
  });

  it('registerTimer honors an explicitly passed hook over the registry default', async () => {
    const connections = makeConnections();
    const explicit: ScheduleHook = vi.fn(async () => ({ proceed: false, done: true }));
    const msg = makeMsg('r1', 1_000);
    await addSchedule(msg);

    registerTimer(msg, explicit, connections as unknown as never);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(explicit).toHaveBeenCalledWith(msg);
    expect(connections.sendTo).not.toHaveBeenCalled();
  });
});
