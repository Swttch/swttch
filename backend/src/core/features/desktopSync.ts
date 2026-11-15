import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { EMPTY_DESKTOP_STATE, readDesktopState, watchDesktopState, type DesktopSessionState } from './desktopSessions';
import { getSponsorStatus } from './license';
import { readMergedSettings } from './settings';
import { isSessionMcpInstalled } from '../session-mcp';
import { announceSessionsUpdated } from './sessionsUpdated';
import { readSessionMarksToShow } from './sessionMarks';
import { seedKnownMarks, takeMarkChanges } from './sessionMarksKnown';

/**
 * Whether what the Claude desktop app records about its sessions is reflected here.
 *
 * It is the machine's own choice (the General settings switch "Reflect changes from Claude Desktop") and a
 * sponsor-only feature, so both have to hold. Off, the lists show only what the session-management package
 * recorded and what this app knows itself: nothing from the desktop app's files reaches a screen.
 *
 * Asked on every list read, so the answer is kept for a short while. The settings switch drops it at once
 * (see [desktopSyncSettingChanged]); a sponsor whose licence lapses is noticed within the window.
 */
const ANSWER_FRESH_MS = 30_000;

let cached: { at: number; enabled: boolean } | null = null;

export async function desktopSyncEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < ANSWER_FRESH_MS) return cached.enabled;
  const { settings } = await readMergedSettings();
  let enabled = settings.desktopSessionSync === true;
  if (enabled) enabled = (await getSponsorStatus().catch(() => ({ isSponsor: false }))).isSponsor;
  cached = { at: Date.now(), enabled };
  return enabled;
}

/** Forget the kept answer (a test, or the switch having been flipped). */
export function resetDesktopSyncCache(): void {
  cached = null;
}

/** What the watcher saw last, kept so that the switch being flipped can apply it without waiting for the desktop app to write. */
let lastState: DesktopSessionState | null = null;

export function rememberDesktopState(state: DesktopSessionState): void {
  lastState = state;
}

/**
 * The desktop app's records for the session lists: what the package's watching command last printed while the
 * sync is on, and nothing while it is off. Read once when no watching has seeded it yet.
 */
export async function currentDesktopState(): Promise<DesktopSessionState> {
  if (!(await desktopSyncEnabled())) return EMPTY_DESKTOP_STATE;
  if (lastState === null) {
    const read = await readDesktopState();
    if (read === EMPTY_DESKTOP_STATE) return read;
    lastState = read;
  }
  return lastState;
}

let stopWatching: (() => void) | null = null;
let syncChain: Promise<void> = Promise.resolve();

async function syncNow(connections: ConnectionManager, restart: boolean): Promise<void> {
  if (stopWatching && restart) {
    stopWatching();
    stopWatching = null;
  }
  const wanted = (await isSessionMcpInstalled()) && (await desktopSyncEnabled());
  if (!wanted) {
    stopWatching?.();
    stopWatching = null;
    lastState = null;
    connections.setDesktopRunning(new Set());
    return;
  }
  if (stopWatching) return;
  const seeded = await readDesktopState();
  if (seeded !== EMPTY_DESKTOP_STATE) lastState = seeded;
  await applyDesktopRunning(connections);
  // The marks as they are when the watching starts are the ones the screens have, so a change that comes
  // after is told as the sessions it is about.
  try {
    seedKnownMarks(await readSessionMarksToShow());
  } catch {
    // Not seeded: the first change is told as a read of the list, which finds out what it was.
  }
  stopWatching = watchDesktopState((state, change) => {
    const before = lastState;
    rememberDesktopState(state);
    if (change.list) void announceListChange(connections, before, state);
    if (change.running) void applyDesktopRunning(connections);
  });
}

/** Whether two maps hold the same entries. */
function sameEntries(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/**
 * The watching said a list changed: the desktop app's records, the package's marks, or both.
 *
 * What the desktop app titles its sessions cannot be told session by session from here, so a change
 * of that has every screen read its list again. Everything else (who a session was put under, what
 * was archived, by the desktop app or by hand) is in the marks the lists show, so each session whose
 * mark differs from what the screens were told is told as an update of that session, and no screen
 * reads its list.
 */
async function announceListChange(
  connections: ConnectionManager,
  before: DesktopSessionState | null,
  after: DesktopSessionState,
): Promise<void> {
  if (!sameEntries(before?.titles ?? new Map(), after.titles)) {
    announceSessionsUpdated(connections, { action: 'refresh' });
    return;
  }
  try {
    const changes = takeMarkChanges(await readSessionMarksToShow());
    if (changes === null) {
      announceSessionsUpdated(connections, { action: 'refresh' });
      return;
    }
    for (const { sessionId, mark } of changes) {
      // Where the package started the session is the one folder the mark says; without it, every screen is told.
      const dir = mark && typeof mark.row.cwd === 'string' ? mark.row.cwd : undefined;
      announceSessionsUpdated(
        connections,
        { action: 'update', session: { sessionId, sessionMark: mark ? mark.row : null } },
        { sessionDirs: dir ? [dir] : [] },
      );
    }
  } catch (err) {
    console.error('[node-backend]', 'Failed to find which marks changed:', err);
    announceSessionsUpdated(connections, { action: 'refresh' });
  }
}

/**
 * Watch the desktop app's records through the package while the sync is on and the package is installed, and
 * stop while either is not so (no process runs for a machine that does not use the sync). Asked at start, when
 * the switch is flipped and after the package was installed or updated (`restart`, so that a package that just
 * gained the commands is picked up). Calls queue, so two never race to start two watchers.
 */
export function syncDesktopWatch(connections: ConnectionManager, restart = false): Promise<void> {
  syncChain = syncChain.then(() => syncNow(connections, restart)).catch(() => undefined);
  return syncChain;
}

/** Hand the sessions running in the desktop app to every screen, or none while the sync is off or the package is not installed. */
export async function applyDesktopRunning(connections: ConnectionManager): Promise<void> {
  const on = lastState !== null && (await isSessionMcpInstalled()) && (await desktopSyncEnabled());
  connections.setDesktopRunning(on && lastState ? lastState.running : new Set());
}

/** The switch was flipped: every screen reads its lists again, and what runs in the desktop app is shown or taken off. */
export async function desktopSyncSettingChanged(connections: ConnectionManager): Promise<void> {
  resetDesktopSyncCache();
  await syncDesktopWatch(connections);
  await applyDesktopRunning(connections);
  announceSessionsUpdated(connections, { action: 'refresh' });
}
