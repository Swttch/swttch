import { LibraryManager } from '../shared';
import { detectLibraryManager } from './install-coordinate';
import { homedir } from 'node:os';
import { getExtendKitInstallation, getExtendKitVersion, resetExtendKitCache } from './extend-kit';
import { getSessionMcpInstallation, getSessionMcpVersion, resetSessionMcpCache } from './session-mcp';
import { buildInstalledKitUpdateSpec, EXTEND_KIT_PACKAGE, SESSION_MCP_PACKAGE } from './global-install-target';
import { fetchDistTags } from './handlers/getCliUpdateInfo';
import { isNewerVersion } from './cli-update';
import { runLauncher } from './run-launcher';
import { resetUsageCache } from './handlers/getUsage';

/** A globally installed companion package this backend keeps current but never installs by itself. */
interface Companion {
  packageName: string;
  tag: string;
  find(): Promise<{ root: string; version: string } | null>;
  /** The version the loader resolves now, read after the install command to confirm it took effect. */
  version(): Promise<string | null>;
  reset(): void;
  /** Drop whatever else was derived from the old version. */
  afterUpdate?(): void;
}

// Each member is called through an arrow so the imports are read at call time, not at import time.
const EXTEND_KIT: Companion = {
  packageName: EXTEND_KIT_PACKAGE,
  tag: 'extend-kit',
  find: () => getExtendKitInstallation(),
  version: () => getExtendKitVersion(),
  reset: () => resetExtendKitCache(),
  afterUpdate: () => resetUsageCache(),
};

const SESSION_MCP: Companion = {
  packageName: SESSION_MCP_PACKAGE,
  tag: 'session-mcp',
  find: () => getSessionMcpInstallation(),
  version: () => getSessionMcpVersion(),
  reset: () => resetSessionMcpCache(),
};

let startupUpdate: Promise<boolean> | undefined;
let sessionMcpStartupUpdate: Promise<boolean> | undefined;

/** One background check per backend boot. Never install a missing companion. */
export function updateInstalledExtendKit(): Promise<boolean> {
  startupUpdate ??= update(EXTEND_KIT).catch(error => {
    console.error('[extend-kit] Startup update failed:', error instanceof Error ? error.message : String(error));
    return false;
  });
  return startupUpdate;
}

/** The same one-per-boot check for the session-management MCP. Never installs a missing one. */
export function updateInstalledSessionMcp(): Promise<boolean> {
  sessionMcpStartupUpdate ??= update(SESSION_MCP).catch(error => {
    console.error('[session-mcp] Startup update failed:', error instanceof Error ? error.message : String(error));
    return false;
  });
  return sessionMcpStartupUpdate;
}

let sessionMcpAutoUpdate: Promise<boolean> | undefined;
/** The release an automatic update tried for and did not reach, so it is not tried again in a loop. */
let sessionMcpGaveUpOn: string | undefined;

/**
 * Bring an outdated session-management MCP up to `latest` now, outside the boot check: a version
 * lookup found a newer release while this backend was already running. Never installs a missing one.
 *
 * One attempt runs at a time, and a release an attempt did not reach is not tried again by itself;
 * the screen then offers its Update button, whose install path reports why.
 *
 * @param onSettled called once when an attempt THIS call started is over, whatever its outcome
 * @returns whether an attempt is running now (this call's or an earlier one's)
 */
export function autoUpdateSessionMcp(latest: string, onSettled: (updated: boolean) => void): boolean {
  if (sessionMcpAutoUpdate) return true;
  if (sessionMcpGaveUpOn === latest) return false;
  const attempt = (async () => {
    // The boot check may be the one already doing this; let it finish first.
    await sessionMcpStartupUpdate;
    return update(SESSION_MCP);
  })()
    .catch(error => {
      console.error('[session-mcp] Automatic update failed:', error instanceof Error ? error.message : String(error));
      return false;
    })
    .then(async updated => {
      const current = updated ? latest : await SESSION_MCP.version().catch(() => null);
      if (!current || isNewerVersion(latest, current)) sessionMcpGaveUpOn = latest;
      return updated;
    })
    .finally(() => {
      sessionMcpAutoUpdate = undefined;
    });
  sessionMcpAutoUpdate = attempt;
  void attempt.then(onSettled);
  return true;
}

/** Manual install/removal waits for a pending startup or automatic update before changing the store. */
export async function waitForSessionMcpStartupUpdate(): Promise<void> {
  await sessionMcpStartupUpdate;
  await sessionMcpAutoUpdate;
}

/** Manual install/removal waits for a pending startup update before changing the store. */
export async function waitForExtendKitStartupUpdate(): Promise<void> {
  await startupUpdate;
}

async function update(companion: Companion): Promise<boolean> {
  const { packageName, tag } = companion;
  const installed = await companion.find();
  if (!installed) return false;
  const { latest } = await fetchDistTags(packageName);
  if (!latest || !isNewerVersion(latest, installed.version)) return false;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const spec = buildInstalledKitUpdateSpec(installed.root, latest, process.execPath, home, process.platform, undefined, packageName);
  if (!spec) return false;
  const options = { timeout: 180_000, maxBuffer: 10 * 1024 * 1024,
    ...(spec.env ? { env: spec.env } : {}), cwd: home };
  const library = detectLibraryManager([`${installed.root}/${packageName}`], home);
  if ([LibraryManager.PNPM, LibraryManager.YARN].includes(library)) {
    const args = library === LibraryManager.PNPM ? ['root', '-g']
      : ['global', 'dir'];
    const probe = await runLauncher(spec.command, args, { ...options, timeout: 15_000 });
    const lines = probe.output.trim().split(/\r?\n/);
    if (!probe.ok || lines.length !== 1) return false;
    const reported = library === LibraryManager.YARN ? `${lines[0]}/node_modules` : lines[0];
    const normalize = (value: string) => {
      const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    if (normalize(reported) !== normalize(installed.root)) return false;
  }
  // An external uninstall or switch during the registry request cancels this check.
  companion.reset();
  const current = await companion.find();
  if (!current || current.root !== installed.root || current.version !== installed.version) return false;
  const result = await runLauncher(spec.command, spec.args, options);
  companion.reset();
  if (!result.ok) throw new Error(result.output || 'Companion update command failed');
  const actual = await companion.version();
  if (!actual || isNewerVersion(latest, actual)) {
    throw new Error(`Expected ${latest}, but the active companion is ${actual ?? 'unavailable'}`);
  }
  companion.afterUpdate?.();
  console.info(`[${tag}] Updated ${installed.version} → ${actual}`);
  return true;
}
