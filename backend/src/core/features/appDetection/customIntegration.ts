import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, lstat, constants } from 'fs/promises';
import { extname } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Shared "custom integration" utilities for external editors and terminals.
 *
 * Mirrors GitHub Desktop's `custom-integration` module: a custom integration is
 * a user-provided executable (or macOS .app) plus an argument template in which
 * the token below is replaced by the target file/folder path. Kept dependency-free
 * (no `string-argv` / `windows-argv-parser`) and shell-free (array-arg spawn) to
 * avoid injection and native build complexity.
 */

/** Token in a custom integration's arguments replaced by the target path. */
export const TargetPathArgument = '%TARGET_PATH%';

/**
 * Extensions Node's `spawn` can launch directly on Windows. Wrappers like
 * `.bat`/`.cmd`/`.ps1` require a shell and are intentionally excluded.
 */
const WindowsExecutableExtensions: ReadonlyArray<string> = ['exe', 'com'];

/** A user-configured custom editor/terminal. */
export interface CustomIntegration {
  /** Path to the executable, or to a macOS `.app` bundle. */
  path: string;
  /** Argument template; occurrences of {@link TargetPathArgument} are expanded. */
  arguments: string;
  /** Bundle id when `path` points to a macOS `.app` (enables `open -b`). */
  bundleID?: string;
}

/**
 * Split an arguments string into argv, honoring single/double quotes. Pure
 * implementation — no shell, no external parser.
 */
export function parseCustomIntegrationArguments(input: string): string[] {
  const argv: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    argv.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return argv;
}

/** Replace every {@link TargetPathArgument} token in argv with `targetPath`. */
export function expandTargetPathArgument(
  argv: readonly string[],
  targetPath: string,
): string[] {
  return argv.map((arg) =>
    arg === TargetPathArgument
      ? targetPath
      : arg.split(TargetPathArgument).join(targetPath),
  );
}

/** Whether argv references the target-path placeholder at all. */
export function hasTargetPathArgument(argv: readonly string[]): boolean {
  return argv.some((a) => a.includes(TargetPathArgument));
}

/** macOS: read a `.app` bundle's identifier via Spotlight metadata. */
async function getMacAppBundleId(appPath: string): Promise<string | undefined> {
  if (!appPath.endsWith('.app')) return undefined;
  try {
    const { stdout } = await execFileAsync('mdls', [
      '-name',
      'kMDItemCFBundleIdentifier',
      '-raw',
      appPath,
    ]);
    const id = stdout.trim();
    return id && id !== '(null)' ? id : undefined;
  } catch {
    return undefined;
  }
}

export interface CustomPathValidation {
  isValid: boolean;
  /** Present when the path is a macOS `.app` and its bundle id was resolved. */
  bundleID?: string;
}

/**
 * Validate a custom integration's path. On macOS a `.app` bundle is valid (its
 * bundle id is resolved so it can be launched with `open -b`); elsewhere the path
 * must be an executable file, and on Windows must be a `.exe`/`.com` that `spawn`
 * can launch directly.
 */
export async function validateCustomIntegrationPath(
  path: string,
): Promise<CustomPathValidation> {
  if (!path) return { isValid: false };
  try {
    const stat = await lstat(path);
    const canExecute = await access(path, constants.X_OK)
      .then(() => true)
      .catch(() => false);
    // On Windows `X_OK` ≈ `F_OK`, so additionally restrict to directly-launchable
    // extensions.
    const hasLaunchableExtension =
      process.platform !== 'win32' ||
      WindowsExecutableExtensions.includes(
        extname(path).replace(/^\./, '').toLowerCase(),
      );
    const isExecutableFile =
      (stat.isFile() || stat.isSymbolicLink()) &&
      canExecute &&
      hasLaunchableExtension;

    if (process.platform === 'darwin' && !isExecutableFile && stat.isDirectory()) {
      const bundleID = await getMacAppBundleId(path);
      return { isValid: !!bundleID, bundleID };
    }

    return { isValid: isExecutableFile };
  } catch {
    return { isValid: false };
  }
}
