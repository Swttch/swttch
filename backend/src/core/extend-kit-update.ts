import { LibraryManager } from '../shared';
import { detectLibraryManager } from './install-coordinate';
import { homedir } from 'node:os';
import { getExtendKitInstallation, getExtendKitVersion, resetExtendKitCache } from './extend-kit';
import { buildInstalledKitUpdateSpec, EXTEND_KIT_PACKAGE } from './global-install-target';
import { fetchDistTags } from './handlers/getCliUpdateInfo';
import { isNewerVersion } from './cli-update';
import { runLauncher } from './run-launcher';
import { resetUsageCache } from './handlers/getUsage';

let startupUpdate: Promise<boolean> | undefined;

/** One background check per backend boot. Never install a missing companion. */
export function updateInstalledExtendKit(): Promise<boolean> {
  startupUpdate ??= update().catch(error => {
    console.error('[extend-kit] Startup update failed:', error instanceof Error ? error.message : String(error));
    return false;
  });
  return startupUpdate;
}

/** Manual install/removal waits for a pending startup update before changing the store. */
export async function waitForExtendKitStartupUpdate(): Promise<void> {
  await startupUpdate;
}

async function update(): Promise<boolean> {
  const installed = await getExtendKitInstallation();
  if (!installed) return false;
  const { latest } = await fetchDistTags(EXTEND_KIT_PACKAGE);
  if (!latest || !isNewerVersion(latest, installed.version)) return false;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const spec = buildInstalledKitUpdateSpec(installed.root, latest, process.execPath, home);
  if (!spec) return false;
  const options = { timeout: 180_000, maxBuffer: 10 * 1024 * 1024,
    ...(spec.env ? { env: spec.env } : {}), cwd: home };
  const library = detectLibraryManager([`${installed.root}/${EXTEND_KIT_PACKAGE}`], home);
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
  resetExtendKitCache();
  const current = await getExtendKitInstallation();
  if (!current || current.root !== installed.root || current.version !== installed.version) return false;
  const result = await runLauncher(spec.command, spec.args, options);
  resetExtendKitCache();
  if (!result.ok) throw new Error(result.output || 'Companion update command failed');
  const actual = await getExtendKitVersion();
  if (!actual || isNewerVersion(latest, actual)) {
    throw new Error(`Expected ${latest}, but the active companion is ${actual ?? 'unavailable'}`);
  }
  resetUsageCache();
  console.info(`[extend-kit] Updated ${installed.version} → ${actual}`);
  return true;
}
