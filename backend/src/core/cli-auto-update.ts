import { Claude } from './claude';
import { detectPackageManager } from './cli-update';
import { resetCachedCliVersion } from './features/telemetry';
import { resolveClaudePaths } from './handlers/getCliUpdateInfo';
import { runUpdateSpec } from './handlers/updateCli';
import { logDebug } from '../logging/log-level';
import { PackageManager } from '../shared';

// Same cadence as the CLI's own updater, which only runs in interactive sessions.
const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DOCTOR_TIMEOUT_MS = 30_000;

let running: Promise<boolean> | undefined;
let lastVersion: string | undefined;

/** The CLI's own verdict from the environment and the user and managed settings. */
export function isAutoUpdateEnabled(doctorOutput: string): boolean {
  return /^Auto-updates:\s*enabled\s*$/m.test(doctorOutput);
}

/** The version `claude update` leaves active, and whether this run installed it. */
export function parseUpdateOutput(output: string): { version: string; installed: boolean } | null {
  const installed = output.match(/Successfully updated from \S+ to version (\S+)/);
  if (installed) return { version: installed[1], installed: true };
  const current = output.match(/Claude Code is up to date \(([^)\s]+)\)/);
  return current ? { version: current[1], installed: false } : null;
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

export function startCliAutoUpdate(onUpdated: () => void): void {
  const tick = () => void checkCliAutoUpdate().then(updated => { if (updated) onUpdated(); });
  setTimeout(tick, FIRST_CHECK_DELAY_MS).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}

async function check(): Promise<boolean> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (detectPackageManager(await resolveClaudePaths(), home) !== PackageManager.NATIVE) return false;
  const { stdout } = await Claude.exec(['doctor'], { timeout: DOCTOR_TIMEOUT_MS });
  if (!isAutoUpdateEnabled(stdout)) {
    logDebug('[cli-auto-update]', stdout.match(/^Auto-updates:.*$/m)?.[0] ?? 'No Auto-updates line in claude doctor');
    return false;
  }
  const { ok, output } = await runUpdateSpec('claude', ['update']);
  if (!ok) throw new Error(output || 'claude update failed');
  const result = parseUpdateOutput(output);
  if (!result) {
    logDebug('[cli-auto-update]', output);
    return false;
  }
  // Another project's backend, or a terminal, may have installed it since the last check.
  const changed = result.installed || (lastVersion !== undefined && result.version !== lastVersion);
  lastVersion = result.version;
  if (!changed) return false;
  resetCachedCliVersion();
  console.info(`[cli-auto-update] Claude Code is now ${result.version}`);
  return true;
}
