import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Cross-platform application resolvers used by the editor/terminal catalogs.
 *
 * Each function takes a per-OS descriptor from a catalog entry and returns the
 * launch path of the installed app, or `null` if it isn't installed. macOS uses
 * Spotlight/LaunchServices (finds apps wherever installed, incl. JetBrains
 * Toolbox); Linux uses `which` + XDG desktop entries. Windows lives in
 * `resolveWindows.ts` (registry-based). All commands run shell-free (array args).
 */

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

export interface MacDetection {
  /** Bundle identifiers, most-preferred first. */
  bundleIds: string[];
  /** Fallback `.app` names (without extension) under /Applications or ~/Applications. */
  appNames?: string[];
}

/**
 * Bundle-id → app-path inventory of installed macOS apps, built once by scanning
 * the standard Applications folders and reading each bundle's Info.plist.
 *
 * We read Info.plist directly (via `defaults`) rather than Spotlight
 * (`mdfind`/`mdls`): on machines where Spotlight indexing is disabled — common on
 * dev machines — Spotlight returns nothing, but the plist is always present. This
 * mirrors what GitHub Desktop's LaunchServices-based `app-path` achieves.
 */
let macInventory: Promise<Map<string, string>> | null = null;

async function readBundleId(appPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('defaults', [
      'read',
      join(appPath, 'Contents', 'Info'),
      'CFBundleIdentifier',
    ]);
    const id = stdout.trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

async function buildMacInventory(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dirs = ['/Applications', join(homedir(), 'Applications')];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    await Promise.all(
      entries
        .filter((e) => e.endsWith('.app'))
        .map(async (app) => {
          const appPath = join(dir, app);
          const bundleId = await readBundleId(appPath);
          // Key by lowercase id: bundle ids are effectively case-insensitive and
          // vary by release (e.g. com.jetbrains.RubyMine vs .rubymine).
          const key = bundleId?.toLowerCase();
          if (key && !map.has(key)) {
            map.set(key, appPath);
          }
        }),
    );
  }
  return map;
}

function getMacInventory(): Promise<Map<string, string>> {
  if (!macInventory) {
    macInventory = buildMacInventory();
  }
  return macInventory;
}

export async function resolveMacApp(mac: MacDetection): Promise<string | null> {
  const inventory = await getMacInventory();
  for (const id of mac.bundleIds) {
    const path = inventory.get(id.toLowerCase());
    if (path) {
      return path;
    }
  }
  // Fallback: probe conventional install locations by app name.
  for (const name of mac.appNames ?? []) {
    for (const base of ['/Applications', join(homedir(), 'Applications')]) {
      const path = join(base, `${name}.app`);
      if (await pathExists(path)) {
        return path;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

export interface LinuxDetection {
  /** Executable names to probe on PATH via `which`, most-preferred first. */
  binaries: string[];
}

export async function resolveLinuxApp(
  linux: LinuxDetection,
): Promise<string | null> {
  for (const binary of linux.binaries) {
    try {
      const { stdout } = await execFileAsync('which', [binary]);
      const path = stdout.trim();
      if (path.length > 0) {
        return path;
      }
    } catch {
      // Not on PATH — try the next candidate.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Windows (descriptor here; resolver implemented in resolveWindows.ts)
// ---------------------------------------------------------------------------

/** A single uninstall-registry location to probe. */
export interface WindowsRegistryKey {
  hive: 'HKCU' | 'HKLM';
  /** Use the WOW6432Node (32-bit-on-64-bit) uninstall path. */
  wow64?: boolean;
  /** Subkey under the Uninstall key (e.g. "Sublime Text_is1"). */
  subKey: string;
}

export interface WindowsDetection {
  /**
   * JetBrains IDE product name — expands to version-combo uninstall keys for the
   * last ~2 years (e.g. "WebStorm" → "WebStorm 2024.1", ...). Mutually exclusive
   * with `registryKeys`.
   */
  jetbrainsProduct?: string;
  /** JetBrains exe base under `bin/` (e.g. "webstorm" → bin/webstorm64.exe|webstorm.exe). */
  jetbrainsExeBase?: string;
  /** Explicit uninstall registry keys (non-JetBrains apps). */
  registryKeys?: WindowsRegistryKey[];
  /** DisplayName must start with one of these prefixes. */
  displayNamePrefixes: string[];
  /** Publisher registry value must match one of these. */
  publishers: string[];
  /**
   * Executable path components relative to InstallLocation. Ignored when
   * `useDisplayIcon` is set.
   */
  executableShims?: string[][];
  /** Derive the executable from the DisplayIcon value instead of InstallLocation. */
  useDisplayIcon?: boolean;
}
