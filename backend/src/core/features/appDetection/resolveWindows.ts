import { execFile } from 'child_process';
import { access } from 'fs/promises';
import { join } from 'path';

import type { WindowsDetection, WindowsRegistryKey } from './resolveApp';

/**
 * Windows application resolver, ported from GitHub Desktop's
 * `app/src/lib/editors/win32.ts` (findApplication / registryKeysForJetBrainsIDE /
 * executableShimPathsForJetBrainsIDE / getAppInfo /
 * getCleanInstallLocationFromDisplayIcon / getJetBrainsToolboxEditors).
 *
 * Unlike the original, this does not depend on the native `registry-js`
 * module. Instead it shells out to the built-in `reg query` command via
 * `child_process.execFile` with array args (no shell), and parses its
 * plain-text output. This keeps the dependency footprint to "things the
 * official Windows toolchain already ships" — consistent with this
 * project's policy against relying on undocumented/native SDK internals.
 *
 * This module only does anything useful on win32, but it must still
 * compile and be importable on macOS/Linux (CI builds run there too).
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
// `reg query` wrappers
// ---------------------------------------------------------------------------

/** Runs `reg query "<fullKeyPath>"` and returns raw stdout, or null if the key doesn't exist / the command failed. */
function execRegQuery(fullKeyPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', fullKeyPath], (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(stdout ?? '');
    });
  });
}

/**
 * Reads the named values directly under a registry key (e.g. DisplayName,
 * Publisher, InstallLocation, DisplayIcon). Returns {} if the key doesn't
 * exist — callers treat a missing DisplayName as "not installed".
 *
 * `reg query "<key>"` (no /v, no /s) prints the key header, then one
 * indented line per value ("    <Name>    <REG_TYPE>    <Value>"), then a
 * blank line, then any child subkey paths (unindented). We only parse the
 * indented value lines here.
 */
async function regQueryValues(fullKeyPath: string): Promise<Record<string, string>> {
  const stdout = await execRegQuery(fullKeyPath);
  if (stdout === null) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (!/^\s+\S/.test(line)) {
      // Unindented lines are the key header or child subkey paths, not values.
      continue;
    }
    const match = /^\s+(\S+)\s+(REG_[A-Z_]+)\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, name, , data] = match;
    values[name] = data.trimEnd();
  }
  return values;
}

/**
 * Lists the full paths of the immediate child subkeys of `fullKeyPath`
 * (used to enumerate JetBrains Toolbox uninstall entries, whose subkey
 * names embed a runtime-generated id we can't predict ahead of time).
 */
async function regEnumSubKeys(fullKeyPath: string): Promise<string[]> {
  const stdout = await execRegQuery(fullKeyPath);
  if (stdout === null) {
    return [];
  }

  const subKeys: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith(`${fullKeyPath}\\`)) {
      subKeys.push(line);
    }
  }
  return subKeys;
}

// ---------------------------------------------------------------------------
// Registry key path builders
// ---------------------------------------------------------------------------

const UNINSTALL_SUBKEY = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const WOW64_UNINSTALL_SUBKEY = 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

function currentUserUninstallKeyPath(subKey: string): string {
  return `HKCU\\${UNINSTALL_SUBKEY}\\${subKey}`;
}

function localMachineUninstallKeyPath(subKey: string): string {
  return `HKLM\\${UNINSTALL_SUBKEY}\\${subKey}`;
}

function wow64LocalMachineUninstallKeyPath(subKey: string): string {
  return `HKLM\\${WOW64_UNINSTALL_SUBKEY}\\${subKey}`;
}

function fullKeyPathFor(key: WindowsRegistryKey): string {
  if (key.hive === 'HKCU') {
    return currentUserUninstallKeyPath(key.subKey);
  }
  return key.wow64 ? wow64LocalMachineUninstallKeyPath(key.subKey) : localMachineUninstallKeyPath(key.subKey);
}

/**
 * Generates registry key paths for a given JetBrains product for the last 2
 * years, assuming JetBrains makes no more than 5 major releases and no more
 * than 5 minor releases per year. Mirrors GitHub Desktop's
 * `registryKeysForJetBrainsIDE`, restricted to the WOW6432Node-under-HKLM
 * and HKCU locations JetBrains installers actually use.
 *
 * Returned newest-version-first so the freshest install wins when several
 * versions are registered.
 */
function registryKeysForJetBrainsIDE(product: string): string[] {
  const maxMajorReleasesPerYear = 5;
  const maxMinorReleasesPerYear = 5;
  const lastYear = new Date().getFullYear();
  const firstYear = lastYear - 2;

  const result: string[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    for (let majorRelease = 1; majorRelease <= maxMajorReleasesPerYear; majorRelease++) {
      for (let minorRelease = 0; minorRelease <= maxMinorReleasesPerYear; minorRelease++) {
        let subKey = `${product} ${year}.${majorRelease}`;
        if (minorRelease > 0) {
          subKey = `${subKey}.${minorRelease}`;
        }
        result.push(wow64LocalMachineUninstallKeyPath(subKey));
        result.push(currentUserUninstallKeyPath(subKey));
      }
    }
  }

  // Reverse to prioritize newer versions.
  return result.reverse();
}

/** JetBrains IDEs ship both 64-bit and 32-bit executable shims under `bin/`. */
function executableShimPathsForJetBrainsIDE(baseName: string): string[][] {
  return [
    ['bin', `${baseName}64.exe`],
    ['bin', `${baseName}.exe`],
  ];
}

// ---------------------------------------------------------------------------
// Registry value validation / parsing helpers
// ---------------------------------------------------------------------------

function validateStartsWith(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

/**
 * Handles DisplayIcon values that include an icon index after a comma
 * (e.g. `"C:\Path\app.exe",0`) and/or surrounding quotes, returning only the
 * path to the executable.
 */
function getCleanInstallLocationFromDisplayIcon(displayIconValue: string): string {
  return displayIconValue.split(',')[0].replace(/"/g, '');
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Reads DisplayName/Publisher/InstallLocation (or DisplayIcon) at each of
 * `keyPaths` in order, validates against `win`, and returns the first
 * executable path that both passes validation and exists on disk.
 */
async function tryRegistryKeys(keyPaths: string[], win: WindowsDetection): Promise<string | null> {
  for (const fullKeyPath of keyPaths) {
    const values = await regQueryValues(fullKeyPath);
    const displayName = values.DisplayName ?? '';
    if (displayName.length === 0) {
      continue;
    }

    const publisher = values.Publisher ?? '';
    if (!validateStartsWith(displayName, win.displayNamePrefixes) || !win.publishers.includes(publisher)) {
      continue;
    }

    const candidatePaths: string[] = [];
    if (win.useDisplayIcon) {
      const displayIcon = values.DisplayIcon ?? '';
      if (displayIcon.length > 0) {
        candidatePaths.push(getCleanInstallLocationFromDisplayIcon(displayIcon));
      }
    } else {
      const installLocation = values.InstallLocation ?? '';
      for (const shim of win.executableShims ?? []) {
        candidatePaths.push(join(installLocation, ...shim));
      }
    }

    for (const candidate of candidatePaths) {
      if (candidate.length > 0 && (await pathExists(candidate))) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Enumerates `JetBrains Toolbox (...)` uninstall entries under HKCU (both
 * the plain and WOW6432Node uninstall roots) and resolves the executable
 * from each entry's DisplayIcon. Toolbox subkey names embed a
 * runtime-generated id, so they can't be predicted like the version-combo
 * keys above — they must be discovered via `reg query` enumeration.
 */
async function resolveJetBrainsToolbox(win: WindowsDetection): Promise<string | null> {
  const toolboxNamePattern = /^JetBrains Toolbox \(.*\)$/;

  for (const parentSubKey of [UNINSTALL_SUBKEY, WOW64_UNINSTALL_SUBKEY]) {
    const fullParentPath = `HKCU\\${parentSubKey}`;
    const childKeyPaths = await regEnumSubKeys(fullParentPath);

    for (const fullKeyPath of childKeyPaths) {
      const keyName = fullKeyPath.slice(fullParentPath.length + 1);
      if (!toolboxNamePattern.test(keyName)) {
        continue;
      }

      const values = await regQueryValues(fullKeyPath);
      const displayName = values.DisplayName ?? '';
      if (displayName.length === 0) {
        continue;
      }

      const displayIcon = values.DisplayIcon ?? '';
      if (displayIcon.length === 0) {
        continue;
      }

      const candidate = getCleanInstallLocationFromDisplayIcon(displayIcon);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Resolves the executable path for a Windows application descriptor by
 * probing the uninstall registry (via `reg query`), mirroring GitHub
 * Desktop's `findApplication`. Returns null when nothing installed matches.
 */
export async function resolveWindowsApp(win: WindowsDetection): Promise<string | null> {
  if (win.registryKeys && win.registryKeys.length > 0) {
    const path = await tryRegistryKeys(win.registryKeys.map(fullKeyPathFor), win);
    if (path) {
      return path;
    }
  }

  if (win.jetbrainsProduct) {
    const keyPaths = registryKeysForJetBrainsIDE(win.jetbrainsProduct);
    const executableShims = win.jetbrainsExeBase ? executableShimPathsForJetBrainsIDE(win.jetbrainsExeBase) : [];
    const path = await tryRegistryKeys(keyPaths, { ...win, executableShims, useDisplayIcon: false });
    if (path) {
      return path;
    }

    const toolboxPath = await resolveJetBrainsToolbox(win);
    if (toolboxPath) {
      return toolboxPath;
    }
  }

  return null;
}
