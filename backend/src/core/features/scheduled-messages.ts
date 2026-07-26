import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, ScheduledMessageKind, type ScheduledMessage } from '../../shared';
import {
  addSchedule,
  removeSchedule,
  updateSchedule as updateScheduleInStore,
  readSchedulesForSession,
} from './scheduled-messages-store';

/**
 * The generic scheduled-message engine (the "send later" timer core).
 *
 * At `sendAt` the engine runs a per-kind PRE-SEND HOOK and, if the hook says so,
 * DELIVERS the message the same way a person does: it does NOT write to the CLI's
 * stdin directly. Instead it picks the one tab that should send (see
 * ConnectionManager.pickScheduledDeliveryTarget) and pushes
 * DELIVER_SCHEDULED_MESSAGE to it; that tab runs its normal submit path. The
 * reservation is kept until the tab ACKs with SCHEDULED_MESSAGE_DELIVERED
 * (at-least-once) — this is why `proceed:true` does NOT remove it here. If no tab
 * is available, delivery is skipped and the reservation stays for the next
 * attach. The engine is deliberately domain-agnostic: it never knows *why* a
 * send should proceed (quota reset, etc.). That decision lives entirely in the
 * hook a higher layer registers via `registerHook`.
 *
 * Hook contract (`ScheduleHook`):
 *   - `{ proceed: true }`            → deliver now via the chosen tab; KEEP the
 *                                      reservation until its delivered-ACK arrives.
 *   - `{ proceed: false, done: true }`  → give up: remove the reservation, broadcast (no send).
 *   - `{ proceed: false, done: false }` → wait: the hook OWNS the retry; the engine
 *                                         leaves the reservation in place and does nothing
 *                                         further (the fired timer is gone, so the hook must
 *                                         re-arm it, e.g. by re-scheduling).
 */
export type ScheduleHook = (
  msg: ScheduledMessage,
) => Promise<{ proceed: boolean; done?: boolean; error?: string }>;

/** Live timers keyed by reservation id (in-memory; lost on backend restart, rebuilt by restore). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Per-kind pre-send hook registry. Layer 2 overrides the stub via `registerHook`. */
const hooks = new Map<ScheduledMessageKind, ScheduleHook>();

/** The default stub for AUTO_RESUME: always proceed (layer 2 replaces this with the quota check). */
const alwaysProceed: ScheduleHook = async () => ({ proceed: true });

function installDefaultHooks(): void {
  hooks.clear();
  hooks.set(ScheduledMessageKind.AUTO_RESUME, alwaysProceed);
}
installDefaultHooks();

/** Register (or replace) the pre-send hook for a reservation kind. */
export function registerHook(kind: ScheduledMessageKind, hook: ScheduleHook): void {
  hooks.set(kind, hook);
}

/** Resolve the hook for a kind, defaulting to always-proceed when none is registered. */
function resolveHook(kind: ScheduledMessageKind): ScheduleHook {
  return hooks.get(kind) ?? alwaysProceed;
}

/** Broadcast the session's current reservation list so every subscriber refreshes. */
async function broadcastUpdate(sessionId: string, connections: ConnectionManager): Promise<void> {
  const schedules = await readSchedulesForSession(sessionId);
  connections.broadcastToSession(sessionId, MessageType.SCHEDULED_MESSAGE_UPDATED, {
    sessionId,
    schedules,
  });
}

/** The timer callback: run the hook, then act on its verdict. */
async function fire(
  msg: ScheduledMessage,
  hook: ScheduleHook,
  connections: ConnectionManager,
): Promise<void> {
  timers.delete(msg.id);

  let result: { proceed: boolean; done?: boolean; error?: string };
  try {
    result = await hook(msg);
  } catch (err) {
    // A throwing hook is treated as "give up" so a broken hook cannot wedge the reservation.
    result = { proceed: false, done: true, error: err instanceof Error ? err.message : String(err) };
  }

  if (result.proceed) {
    // Deliver like a person would: hand the message to ONE chosen tab, which
    // runs its normal send path. Keep the reservation until that tab ACKs
    // (SCHEDULED_MESSAGE_DELIVERED → cancelSchedule) so a tab dying mid-delivery
    // redelivers. If no tab is available right now, do nothing — the reservation
    // stays and re-fires when a tab reattaches (restoreSchedulesForSession).
    const target = connections.pickScheduledDeliveryTarget(msg.sessionId, msg.panelId);
    if (target) {
      connections.sendTo(target.connectionId, MessageType.DELIVER_SCHEDULED_MESSAGE, {
        id: msg.id,
        sessionId: msg.sessionId,
        message: msg.message,
        needsSessionSwitch: target.needsSessionSwitch,
      });
    }
    return;
  }

  if (result.done) {
    // Hook gave up: drop the reservation and notify.
    await removeSchedule(msg.sessionId, msg.id);
    await broadcastUpdate(msg.sessionId, connections);
    return;
  }

  // proceed:false, done:false → the hook is waiting and owns the retry. Leave the
  // reservation persisted and do not re-arm here; the hook re-schedules itself.
}

/**
 * Arm a timer for one reservation. `sendAt` in the past fires on the next tick.
 * Idempotent per reservation id (a second call for an already-armed id is a no-op),
 * so restore passes never create duplicate timers.
 */
export function registerTimer(
  msg: ScheduledMessage,
  hook: ScheduleHook,
  connections: ConnectionManager,
): void {
  if (timers.has(msg.id)) return;
  const delay = Math.max(0, new Date(msg.sendAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    void fire(msg, hook, connections);
  }, delay);
  timers.set(msg.id, timer);
}

/** Create a reservation: persist it, arm its timer, and broadcast the change. */
export async function scheduleMessage(
  msg: ScheduledMessage,
  connections: ConnectionManager,
): Promise<void> {
  await addSchedule(msg);
  registerTimer(msg, resolveHook(msg.kind), connections);
  await broadcastUpdate(msg.sessionId, connections);
}

/**
 * Edit a reservation in place (message and/or sendAt): persist the patch, re-arm
 * its timer against the (possibly new) sendAt, and broadcast. Returns false when
 * no such reservation exists. Preserves id/kind/panelId/createdAt.
 */
export async function editScheduledMessage(
  sessionId: string,
  id: string,
  patch: { message?: string; sendAt?: string },
  connections: ConnectionManager,
): Promise<boolean> {
  const updated = await updateScheduleInStore(sessionId, id, patch);
  if (!updated) return false;
  // Re-arm: clear the old timer, then register against the updated reservation
  // (registerTimer dedups on id, so clear first for a new sendAt to take effect).
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  registerTimer(updated, resolveHook(updated.kind), connections);
  await broadcastUpdate(sessionId, connections);
  return true;
}

/** Cancel a reservation: clear its timer, remove it from the store, and broadcast. */
export async function cancelSchedule(
  sessionId: string,
  id: string,
  connections: ConnectionManager,
): Promise<void> {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  await removeSchedule(sessionId, id);
  await broadcastUpdate(sessionId, connections);
}

/**
 * Re-arm timers for a session's persisted reservations. Called when a session's
 * process comes alive (see claude-process.ensureClaudeProcess) so reservations
 * that outlived a backend restart resume ticking. Already-armed ids are skipped
 * (registerTimer dedups), so repeated calls are safe.
 */
export async function restoreSchedulesForSession(
  sessionId: string,
  connections: ConnectionManager,
): Promise<void> {
  const schedules = await readSchedulesForSession(sessionId);
  for (const msg of schedules) {
    if (timers.has(msg.id)) continue;
    registerTimer(msg, resolveHook(msg.kind), connections);
  }
}

/** Clear every armed timer (e.g. on shutdown). Does not touch the persisted store. */
export function clearAllScheduledTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

/** Test-only: reset all in-memory engine state (timers + hook registry) to defaults. */
export function resetSchedulerForTest(): void {
  clearAllScheduledTimers();
  installDefaultHooks();
}
