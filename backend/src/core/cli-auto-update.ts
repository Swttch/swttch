import { execFile } from 'child_process';
import { mkdir, open, rm, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { Claude } from './claude';
import { isNewerVersion } from './cli-update';
import { readCliAutoUpdateState } from './features/cli-auto-update-setting';
import { resetCachedCliVersion } from './features/telemetry';
import { logDebug } from '../logging/log-level';
import {
  CliUpdateChannel,
  MessageType,
  PackageManager,
  UpdateMode,
  type CliUpdateInfo,
} from '../shared';

/**
 * Background update of the Claude Code CLI.
 *
 * ── The same request as the Update button ─────────────────────────────────────────────────
 * The check does not run an update command of its own. It asks the backend's own router the
 * two things the About screen asks when the user clicks Update: GET_CLI_UPDATE_INFO for the
 * installed version and the stable/latest releases, then UPDATE_CLI with the version to
 * install. Both go in through {@link WebviewRequest}, the same entry a webview message takes,
 * so every install method the button can update (native, npm, pnpm, yarn, volta, Homebrew,
 * WinGet) is updated here too, by the same command.
 *
 * ── When a check runs ─────────────────────────────────────────────────────────────────────
 * The interactive CLI looks for an update when it is launched, not on a clock. The plugin's
 * counterpart of launching `claude` is a chat spawning one, so that is the trigger, plus one
 * check shortly after the backend starts. There is deliberately no timer: a backend nobody is
 * using must not reach the registry or run an update every half hour (#477). Triggers closer
 * together than CHECK_THROTTLE_MS are dropped, so opening several chats in a row costs one.
 *
 * ── Running sessions ──────────────────────────────────────────────────────────────────────
 * An update never stops a running `claude`. Every install method ships `claude` as a single
 * executable, and on macOS and Linux replacing it unlinks the old file rather than rewriting
 * it, so a running process keeps the binary it started from and the next chat starts the new
 * one. Windows cannot replace an executable that is running, so there a package-manager
 * update waits until no `claude.exe` is running at all. A native install updates through
 * `claude update`, which installs each version side by side and needs no such wait.
 */

/** Sends a message into the backend's router as a webview would, and resolves its ACK. */
export type WebviewRequest = (type: MessageType, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;

const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_THROTTLE_MS = 30 * 60 * 1000;
/** Longer than UPDATE_CLI's own 180 s limit, so a lock is only called stale once its holder is gone. */
const LOCK_STALE_MS = 10 * 60 * 1000;

let running: Promise<boolean> | undefined;
let lastVersion: string | undefined;
let lastCheckAt: number | undefined;
let request: WebviewRequest | undefined;
let onUpdated: (() => void) | undefined;

/**
 * The release a check updates to: the one `autoUpdatesChannel` names, or null when nothing
 * newer than the installed version is on it. Never a downgrade, which is what `stable` would
 * otherwise mean for a CLI already ahead of it.
 */
export function targetVersion(info: CliUpdateInfo, channel: CliUpdateChannel): string | null {
  const target = channel === CliUpdateChannel.STABLE ? info.stable : info.latest;
  if (!target || !info.cliVersion) return null;
  return isNewerVersion(target, info.cliVersion) ? target : null;
}

/** Resolves true when the CLI version changed, whoever installed it. */
export function checkCliAutoUpdate(): Promise<boolean> {
  running ??= check()
    .catch(error => {
      console.warn('[cli-auto-update] Check failed:', error instanceof Error ? error.message : String(error));
      return false;
    })
    .finally(() => { running = undefined; });
  return running;
}

/** Connect the check to the backend's router and schedule the check that follows startup. */
export function startCliAutoUpdate(send: WebviewRequest, announce: () => void): void {
  request = send;
  onUpdated = announce;
  setTimeout(triggerCliAutoUpdate, FIRST_CHECK_DELAY_MS).unref();
}

/**
 * Ask for a check without waiting for it. Called when a chat spawns `claude`, so it must never
 * delay or fail the spawn: it returns at once, and the check reports its own errors.
 *
 * Does nothing before {@link startCliAutoUpdate}, so code paths exercised without a running
 * server, tests among them, never reach the registry.
 */
export function triggerCliAutoUpdate(): void {
  if (!request || !onUpdated) return;
  const now = Date.now();
  if (lastCheckAt !== undefined && now - lastCheckAt < CHECK_THROTTLE_MS) return;
  lastCheckAt = now;
  const announce = onUpdated;
  void checkCliAutoUpdate().then(updated => { if (updated) announce(); });
}

async function check(): Promise<boolean> {
  const send = request;
  if (!send) return false;

  // The global Claude data directory, as `claude` sees it outside any project.
  await Claude.applyConfigDir();
  const setting = await readCliAutoUpdateState();
  if (!setting.enabled) {
    logDebug('[cli-auto-update]', 'Claude Code auto-updates are off');
    return false;
  }

  const info = await send(MessageType.GET_CLI_UPDATE_INFO) as unknown as CliUpdateInfo & { status?: string; error?: string };
  if (info.status !== 'ok') throw new Error(info.error ?? 'GET_CLI_UPDATE_INFO failed');
  if (info.updateMode === UpdateMode.NONE) return false;

  // A version installed since the last check, by another project's backend or a terminal.
  const changedElsewhere = lastVersion !== undefined && info.cliVersion !== null && info.cliVersion !== lastVersion;
  lastVersion = info.cliVersion ?? lastVersion;

  const target = targetVersion(info, setting.channel);
  if (!target) return settle(changedElsewhere);

  if (process.platform === 'win32' && info.packageManager !== PackageManager.NATIVE && await isClaudeRunning()) {
    logDebug('[cli-auto-update]', `Waiting for every claude.exe to exit before updating to ${target}`);
    return settle(changedElsewhere);
  }

  const lock = await acquireLock();
  if (!lock) {
    logDebug('[cli-auto-update]', 'Another backend is updating Claude Code');
    return settle(changedElsewhere);
  }
  try {
    // What the About screen sends: a concrete version for VERSIONED installs, none for SIMPLE ones.
    const payload = info.updateMode === UpdateMode.VERSIONED ? { version: target } : {};
    const result = await send(MessageType.UPDATE_CLI, payload);
    if (result.status !== 'ok') throw new Error(String(result.error ?? 'UPDATE_CLI failed'));
    const newVersion = typeof result.newVersion === 'string' ? result.newVersion : null;
    const changed = newVersion !== null && newVersion !== info.cliVersion;
    lastVersion = newVersion ?? lastVersion;
    if (changed) console.info(`[cli-auto-update] Claude Code is now ${newVersion}`);
    return settle(changed || changedElsewhere);
  } finally {
    await lock.release();
  }
}

function settle(changed: boolean): boolean {
  if (changed) resetCachedCliVersion();
  return changed;
}

/** Whether any `claude.exe` is running on this Windows machine, from any project or terminal. */
function isClaudeRunning(): Promise<boolean> {
  return new Promise(resolve => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/NH'], { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      // Unknown counts as running: waiting costs one more trigger, replacing a running exe fails.
      if (error) return resolve(true);
      resolve(/claude\.exe/i.test(stdout));
    });
  });
}

function lockPath(): string {
  const home = process.env.CCG_HOME?.trim() || join(homedir(), '.claude-code-gui');
  return join(home, 'cli-auto-update.lock');
}

/**
 * One update at a time across every backend on the machine. One backend runs per open
 * project, and two of them starting the same global install at once can leave it half written.
 */
async function acquireLock(): Promise<{ release: () => Promise<void> } | null> {
  const path = lockPath();
  await mkdir(join(path, '..'), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return { release: () => rm(path, { force: true }) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const held = await stat(path).catch(() => null);
      // Gone since the open failed: its holder just finished, so try once more.
      if (held && Date.now() - held.mtimeMs < LOCK_STALE_MS) return null;
      await rm(path, { force: true });
    }
  }
  return null;
}
