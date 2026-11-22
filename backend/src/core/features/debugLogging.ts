/**
 * The "Debug Mode" setting and the places debug lines are recorded (issue #723).
 *
 * "Debug Mode" used to be a stored value that nothing read. It is now one switch kept
 * equal in three places:
 *
 *   - this backend's own log floor (`CCG_LOG_LEVEL`, read on every call),
 *   - the host's debug-log switch, through the Bridge (JetBrains: the DEBUG level of the
 *     plugin's categories in idea.log, which the user can also change in the IDE's
 *     Debug Log Settings),
 *   - the webview's forwarding floor (set by the page when it sees the setting).
 *
 * The setting is the memory; the host is the other place the user can flip it. Neither
 * side may overwrite the other blindly, so [reconcileDebugLogging] decides who wins.
 */

import type { Bridge } from '../../bridge/bridge-interface';
import type { ConnectionManager } from '../../ws/connection-manager';
import { LOG_LEVEL_ENV, isDebugEnabled } from '../../logging/log-level';
import { MessageType } from '../../shared';
import { readMergedSettings, readSettingsFile, saveSettingToScope } from './settings';

/** The floor this process started with, so turning debug off puts it back. */
const STARTUP_LEVEL = process.env[LOG_LEVEL_ENV];

/** Make this backend record (or stop recording) its own DEBUG lines. */
export function setBackendDebugFloor(enabled: boolean): void {
  if (enabled) {
    process.env[LOG_LEVEL_ENV] = 'debug';
    return;
  }
  // Restore what the process was started with, unless that was debug itself: a user who
  // launched with CCG_LOG_LEVEL=debug and then turned the setting off means "off".
  if (STARTUP_LEVEL && STARTUP_LEVEL.trim().toLowerCase() !== 'debug') {
    process.env[LOG_LEVEL_ENV] = STARTUP_LEVEL;
  } else {
    delete process.env[LOG_LEVEL_ENV];
  }
}

/** Whether this backend is recording its own DEBUG lines right now. */
export function isBackendDebugOn(): boolean {
  return isDebugEnabled();
}

/**
 * Apply a saved "Debug Mode" value: the backend's own floor, then the host's switch.
 * The host may be absent or not answering; the setting still took effect here.
 */
export async function applyDebugLogging(enabled: boolean, bridge: Bridge): Promise<void> {
  setBackendDebugFloor(enabled);
  try {
    await bridge.setDebugLogging(enabled);
  } catch (err) {
    console.error('[node-backend]', 'setDebugLogging failed:', err);
  }
}

/** What [reconcileDebugLogging] did, for callers that must tell the webview. */
export type DebugLoggingReconcile = 'in-sync' | 'adopted-host' | 'pushed-setting' | 'host-unreachable';

/**
 * Bring the setting and the host's switch to one value, when they disagree.
 *
 * Done when a panel opens, because that is when a change made on the host's side (the IDE's
 * Debug Log Settings, or `CCG_LOG_LEVEL=debug` at launch) has had time to happen without
 * anyone telling us. A disagreement is read as the one that moved most recently:
 *
 *   host on,  setting off -> the user turned it on from the host: adopt it (save the setting).
 *   host off, setting on  -> the setting was saved earlier and the host forgot it, as after
 *                            an IDE restart: push it to the host.
 *
 * The case "host turned off while the setting is on" cannot be told apart from the second
 * one here. The host reports that case itself as it happens (DEBUG_LOGGING_CHANGED), so it
 * has already been saved by the time this runs.
 */
export async function reconcileDebugLogging(
  bridge: Bridge,
  settingEnabled: boolean,
  saveSetting: (enabled: boolean) => Promise<void>,
): Promise<DebugLoggingReconcile> {
  let hostEnabled: boolean;
  try {
    hostEnabled = await bridge.getDebugLogging();
  } catch {
    return 'host-unreachable';
  }
  if (hostEnabled === settingEnabled) {
    setBackendDebugFloor(settingEnabled);
    return 'in-sync';
  }
  if (hostEnabled) {
    setBackendDebugFloor(true);
    await saveSetting(true);
    return 'adopted-host';
  }
  await applyDebugLogging(true, bridge);
  return 'pushed-setting';
}

/** Save the "Debug Mode" setting and tell every open page, so the toggle on screen follows. */
async function saveAndBroadcast(enabled: boolean, connections: ConnectionManager): Promise<void> {
  const result = await saveSettingToScope('debugMode', enabled, 'global');
  if (result.status !== 'ok') return;
  const { settings, overrides } = await readMergedSettings();
  connections.broadcastToAll(MessageType.SETTINGS_CHANGED, { settings, overrides });
}

const PANEL_OPEN_MIN_INTERVAL_MS = 5000;
let lastPanelOpenReconcileAt = 0;

/**
 * Reconcile when a panel opens (see [reconcileDebugLogging]). Many panels can open at once
 * and each asks the host, so a recent answer is reused for a few seconds.
 */
export async function reconcileOnPanelOpen(bridge: Bridge, connections: ConnectionManager): Promise<void> {
  const now = Date.now();
  if (now - lastPanelOpenReconcileAt < PANEL_OPEN_MIN_INTERVAL_MS) return;
  lastPanelOpenReconcileAt = now;

  try {
    const settings = await readSettingsFile();
    const outcome = await reconcileDebugLogging(bridge, settings['debugMode'] === true, (enabled) =>
      saveAndBroadcast(enabled, connections),
    );
    if (outcome === 'host-unreachable') {
      // Not an answer: let the next panel ask again instead of waiting out the interval.
      lastPanelOpenReconcileAt = 0;
    }
  } catch (err) {
    // Opening a panel must never fail because of a log switch.
    console.error('[node-backend]', 'reconcileDebugLogging failed:', err);
    lastPanelOpenReconcileAt = 0;
  }
}

/** The host's switch moved on its own (DEBUG_LOGGING_CHANGED): the setting follows it. */
export async function onHostDebugLoggingChanged(enabled: boolean, connections: ConnectionManager): Promise<void> {
  setBackendDebugFloor(enabled);
  await saveAndBroadcast(enabled, connections);
}

/** @internal test-only: forget the last panel-open reconcile. */
export function _resetPanelOpenThrottle(): void {
  lastPanelOpenReconcileAt = 0;
}
