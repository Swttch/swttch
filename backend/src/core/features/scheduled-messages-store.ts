import { readFile, writeFile, rename, unlink, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { ScheduledMessage } from '../../shared';

/**
 * Persistence for scheduled-message reservations (the "send later" engine).
 *
 *   ~/.claude-code-gui/scheduled-messages.json
 *     — a map keyed by sessionId to that session's reservation array:
 *       { [sessionId: string]: ScheduledMessage[] }
 *
 * Reservations are bound to a SESSION (not an account); a session may hold
 * several independent reservations, hence the per-session array. The file is
 * written 0600 (it carries no secrets, but stays user-private) via the same
 * temp-file + rename atomic-write pattern as `account-store.ts`.
 *
 * This module only does file I/O — timer scheduling / hook dispatch lives in
 * `scheduled-messages.ts`.
 */

/** On-disk shape: sessionId → that session's reservations. */
export type ScheduledMessagesFile = Record<string, ScheduledMessage[]>;

function baseDir(): string {
  return join(homedir(), '.claude-code-gui');
}
function storePath(): string {
  return join(baseDir(), 'scheduled-messages.json');
}

async function writeAtomic0600(target: string, content: string): Promise<void> {
  // Mirrors account-store's atomic write: write to a unique temp file, then
  // rename over the target so a concurrent reader never sees a partial file.
  // (On Windows NTFS ignores the 0o600 mode bits — same limitation as the CLI.)
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content, { encoding: 'utf-8', mode: 0o600 });
    await rename(temp, target);
    await chmod(target, 0o600).catch(() => undefined);
  } finally {
    if (existsSync(temp)) await unlink(temp).catch(() => undefined);
  }
}

/** Read the whole store, returning an empty map when absent or unparseable. */
export async function readAllSchedules(): Promise<ScheduledMessagesFile> {
  const path = storePath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as Partial<ScheduledMessagesFile>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: ScheduledMessagesFile = {};
    for (const [sessionId, list] of Object.entries(raw)) {
      if (Array.isArray(list)) out[sessionId] = list;
    }
    return out;
  } catch {
    return {};
  }
}

/** Overwrite the whole store (0600). */
async function writeAllSchedules(all: ScheduledMessagesFile): Promise<void> {
  await writeAtomic0600(storePath(), JSON.stringify(all, null, 2) + '\n');
}

/** Read one session's reservations (empty array when the session has none). */
export async function readSchedulesForSession(sessionId: string): Promise<ScheduledMessage[]> {
  const all = await readAllSchedules();
  return all[sessionId] ?? [];
}

/** Append one reservation to its session's array and persist. */
export async function addSchedule(msg: ScheduledMessage): Promise<void> {
  const all = await readAllSchedules();
  const list = all[msg.sessionId] ?? [];
  list.push(msg);
  all[msg.sessionId] = list;
  await writeAllSchedules(all);
}

/**
 * Patch one reservation in place (message and/or sendAt) and persist. Preserves
 * id/kind/panelId/createdAt. Returns the updated reservation, or null when no
 * reservation with that id exists for the session.
 */
export async function updateSchedule(
  sessionId: string,
  id: string,
  patch: { message?: string; sendAt?: string },
): Promise<ScheduledMessage | null> {
  const all = await readAllSchedules();
  const list = all[sessionId];
  if (!list) return null;
  const idx = list.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  const updated: ScheduledMessage = {
    ...list[idx],
    ...(patch.message !== undefined ? { message: patch.message } : {}),
    ...(patch.sendAt !== undefined ? { sendAt: patch.sendAt } : {}),
  };
  list[idx] = updated;
  all[sessionId] = list;
  await writeAllSchedules(all);
  return updated;
}

/** Remove one reservation by id; drops the session key when it becomes empty. */
export async function removeSchedule(sessionId: string, id: string): Promise<void> {
  const all = await readAllSchedules();
  const list = all[sessionId];
  if (!list) return;
  const next = list.filter((m) => m.id !== id);
  if (next.length === 0) {
    delete all[sessionId];
  } else {
    all[sessionId] = next;
  }
  await writeAllSchedules(all);
}

/** Remove every reservation for a session (e.g. the session was deleted). */
export async function removeSchedulesForSession(sessionId: string): Promise<void> {
  const all = await readAllSchedules();
  if (!(sessionId in all)) return;
  delete all[sessionId];
  await writeAllSchedules(all);
}
