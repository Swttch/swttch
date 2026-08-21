import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { release, version } from 'os';
import { parseOsRelease, formatOsRelease } from './os-release';

/**
 * A human-readable OS identifier for display (About) and bug reports.
 *
 * ## Why this is not just `os.release()`
 *
 * `os.release()` returns the *kernel* release, which answers a different question
 * on every platform we ship to:
 *
 * - macOS: reports `25.5.0` (Darwin kernel) on a machine the user knows as
 *   `26.5.2`. Copied into a bug report, that number is simply wrong.
 * - Linux: reports the kernel (`6.8.0-45-generic`) and says nothing about the
 *   *distribution*, which is the part that matters when diagnosing Linux issues.
 * - Windows: reports `10.0.26100`, which does map onto the build users quote.
 *
 * So each platform is resolved from the source that actually identifies it, and
 * every path degrades to the `os.release()` value rather than failing.
 */

/** Absolute paths: these are fixed system binaries, so never resolve them via PATH. */
const SW_VERS = '/usr/bin/sw_vers';
const OS_RELEASE_PATHS = ['/etc/os-release', '/usr/lib/os-release'] as const;

const EXEC_TIMEOUT_MS = 3000;

/** Kernel-level fallback, used verbatim whenever the richer source is unavailable. */
function kernelFallback(): string {
  return `${process.platform} ${release()}`;
}

/** Run a fixed system binary and capture stdout. Resolves to null on any failure. */
function runSystemBinary(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: EXEC_TIMEOUT_MS }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

/**
 * Parse `sw_vers` output into `macOS 26.5.2 (25F84)`.
 *
 * Output is one `Key:\tValue` pair per line:
 *   ProductName:    macOS
 *   ProductVersion: 26.5.2
 *   BuildVersion:   25F84
 *
 * Exported for tests — the formatting rules are what we actually want to pin.
 */
export function formatSwVers(stdout: string): string | null {
  const fields = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const productVersion = fields.get('ProductVersion');
  if (!productVersion) return null;

  // ProductName is "macOS" on modern releases and "Mac OS X" on older ones; trust
  // whatever the machine reports rather than hardcoding a name.
  const productName = fields.get('ProductName') ?? 'macOS';
  const build = fields.get('BuildVersion');
  return build ? `${productName} ${productVersion} (${build})` : `${productName} ${productVersion}`;
}

/** macOS: `sw_vers` is the only source carrying the product version and build. */
async function getMacOsInfo(): Promise<string> {
  const stdout = await runSystemBinary(SW_VERS, []);
  if (stdout === null) return kernelFallback();
  return formatSwVers(stdout) ?? kernelFallback();
}

/**
 * Linux: read the distro identity from os-release. `/etc/os-release` is the
 * canonical location; `/usr/lib/os-release` is the spec's fallback for systems
 * where /etc may be empty.
 */
async function getLinuxInfo(): Promise<string> {
  for (const path of OS_RELEASE_PATHS) {
    try {
      const contents = await readFile(path, 'utf-8');
      const parsed = parseOsRelease(contents);
      // An os-release with none of our keys tells us nothing — keep looking.
      if (Object.keys(parsed).length === 0) continue;
      // The kernel release stays attached: on Linux it is genuinely diagnostic,
      // unlike on macOS where it merely duplicates a wrong number.
      return `${formatOsRelease(parsed)} (kernel ${release()})`;
    } catch {
      // Missing or unreadable — try the next location.
    }
  }
  return kernelFallback();
}

/**
 * Windows: `os.release()` yields `10.0.26100` — the build users quote from winver
 * — so it is the trusted part of the string and always present.
 *
 * `os.version()` is documented only as "a string identifying the kernel version"
 * (backed by `RtlGetVersion()` on Windows); its exact shape there is UNVERIFIED
 * on our dev hosts, which are macOS. So it is appended only when it looks like a
 * descriptive name rather than a repeat of the numbers, and never replaces the
 * build. Both are Node built-ins, so no process is spawned either way.
 */
/** Exported for tests: our dev hosts are macOS, so the Windows shape cannot be observed here. */
export function formatWindows(descriptiveRaw: string, build: string): string {
  const descriptive = descriptiveRaw.trim();
  // Only take it if it carries letters (a name) and is not simply the build again.
  const useDescriptive = /[a-z]/i.test(descriptive) && !descriptive.includes(build);
  return useDescriptive ? `${descriptive} (${build})` : `Windows ${build}`;
}

function getWindowsInfo(): string {
  return formatWindows(version(), release());
}

/**
 * Resolve the display string for the OS this backend is running on.
 *
 * Note this is deliberately the *backend's* machine, not the browser's: in
 * standalone mode the backend still runs on the user's own machine, so it has a
 * far more accurate view than a browser user agent (which Apple freezes at
 * `10_15_7` regardless of the real version).
 *
 * Never rejects — every branch degrades to the kernel-level string.
 */
export async function getOsInfo(): Promise<string> {
  try {
    if (process.platform === 'darwin') return await getMacOsInfo();
    if (process.platform === 'linux') return await getLinuxInfo();
    if (process.platform === 'win32') return getWindowsInfo();
    return kernelFallback();
  } catch {
    return kernelFallback();
  }
}
