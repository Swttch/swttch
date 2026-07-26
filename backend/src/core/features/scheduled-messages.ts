import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, ScheduledMessageKind, type ScheduledMessage } from '../../shared';
import { sendMessageToProcess } from '../claude-process';
import {
  addSchedule,
  removeSchedule,
  readSchedulesForSession,
} from './scheduled-messages-store';

/**
 * The generic scheduled-message engine (the "send later" timer core).
 *
 * At `sendAt` the engine runs a per-kind PRE-SEND HOOK and, if the hook says so,
 * delivers the reservation's message to the session's Claude CLI process, then
 * removes the reservation and broadcasts the change. The engine is deliberately
 * domain-agnostic: it never knows *why* a send should proceed (quota reset,
 * etc.). That decision lives entirely in the hook a higher layer registers via
 * `registerHook`.
 *
 * Hook contract (`ScheduleHook`):
 *   - `{ proceed: true }`            → send now, remove the reservation, broadcast.
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
    sendMessageToProcess(connections, msg.sessionId, msg.message);
    await removeSchedule(msg.sessionId, msg.id);
    await broadcastUpdate(msg.sessionId, connections);
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
