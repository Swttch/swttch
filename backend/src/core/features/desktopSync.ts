import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import type { DesktopSessionState } from './desktopSessions';
import { getSponsorStatus } from './license';
import { readMergedSettings } from './settings';
import { isSessionMcpInstalled } from '../session-mcp';

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

/** Hand the sessions running in the desktop app to every screen, or none while the sync is off or the package is not installed. */
export async function applyDesktopRunning(connections: ConnectionManager): Promise<void> {
  const on = lastState !== null && (await isSessionMcpInstalled()) && (await desktopSyncEnabled());
  connections.setDesktopRunning(on && lastState ? lastState.running : new Set());
}

/** The switch was flipped: every screen reads its lists again, and what runs in the desktop app is shown or taken off. */
export async function desktopSyncSettingChanged(connections: ConnectionManager): Promise<void> {
  resetDesktopSyncCache();
  await applyDesktopRunning(connections);
  connections.broadcastToAll(MessageType.SESSIONS_UPDATED, { action: 'refresh' });
}
