import { existsSync } from 'node:fs';
import { LibraryManager, AppChannel, PackageManager, type InstallCoordinate } from '../shared';
import {
  detectInstallCoordinate,
  toPackageManager,
  launcherFor,
  npmPrefixFor,
  ALL_LIBRARY_MANAGERS,
} from './install-coordinate';

/** The npm package the voice input and the usage panel both load. */
export const EXTEND_KIT_PACKAGE = '@swttch/extend-kit';

/**
 * WHERE a global npm package must be installed so THIS backend can load it.
 *
 * Three screens can install the kit — the composer's install banner, and the
 * settings section's install and update buttons — a fourth tells the user what
 * to paste into a terminal, and a fifth removes it. All five resolve the target
 * here, so they cannot disagree about which store owns the package.
 *
 * The answer is an {@link InstallCoordinate}, not a single manager name. See
 * install-coordinate.ts for why one name is not enough; in short, "volta" and
 * "npm under volta's Node" are different stores, and a delete that knows only
 * the first leaves the second in place.
 *
 * Which coordinate wins:
 *
 * 1. If `claude` is on PATH, its install decides. A user who runs `claude` in a
 *    terminal has already chosen the tooling this machine uses, and the kit has
 *    to end up in the same world. CLI equivalence applied to installing.
 *
 * 2. Otherwise the Node running this backend decides, since that is the Node
 *    that will later load the kit.
 *
 * The two are merged rather than one replacing the other: `claude` names the
 * library store when it came from one, and the backend's Node always names the
 * runtime, so a native-installer `claude` on a volta Node still resolves to a
 * usable library manager instead of falling through to a bare guess.
 */
export function resolveInstallCoordinate(
  claudePaths: Array<string | null | undefined>,
  nodeExecPath: string,
  home: string,
  platform: NodeJS.Platform = process.platform,
): InstallCoordinate {
  const fromClaude = detectInstallCoordinate(claudePaths, home, platform);
  const fromNode = detectInstallCoordinate([nodeExecPath], home, platform);

  return {
    // The runtime is a property of the Node we are running on. `claude` can
    // corroborate it, but a native-installer claude says nothing about Node.
    runtime: fromNode.runtime !== 'unknown' ? fromNode.runtime : fromClaude.runtime,
    // The library store is what `claude` reveals when it is an npm-style
    // install; otherwise infer it from the runtime (via the legacy mapping).
    library:
      fromClaude.library !== LibraryManager.UNKNOWN
        ? fromClaude.library
        : libraryFromRuntime(fromNode, fromClaude),
    channel: fromClaude.channel,
  };
}

/** The store a runtime implies when no package path is available to read. */
function libraryFromRuntime(fromNode: InstallCoordinate, fromClaude: InstallCoordinate): LibraryManager {
  const pm = toPackageManager({ ...fromNode, channel: AppChannel.NONE });
  switch (pm) {
    case PackageManager.VOLTA:
      return LibraryManager.VOLTA;
    case PackageManager.PNPM:
      return LibraryManager.PNPM;
    case PackageManager.YARN:
      return LibraryManager.YARN;
    case PackageManager.NPM:
      return LibraryManager.NPM;
    default:
      // Nothing in the Node path either — the claude side may still know the
      // runtime (e.g. a volta shim) even when it named no library store.
      return fromClaude.runtime === 'volta' ? LibraryManager.VOLTA : LibraryManager.NPM;
  }
}

/**
 * The single manager an install should use.
 *
 * App channels (Homebrew cask, the native installer, WinGet) ship Claude Code
 * itself and cannot install an npm package, so they never appear here: the
 * library axis answers this question, falling back to npm.
 */
export function installManagerFor(coord: InstallCoordinate): LibraryManager {
  return coord.library === LibraryManager.UNKNOWN ? LibraryManager.NPM : coord.library;
}

export interface InstallSpec {
  command: string;
  args: string[];
}

/**
 * `--prefix <dir>` for npm, so the command cannot be redirected by config.
 *
 * Picking the right npm binary is not enough: `npm_config_prefix` in the
 * environment overrides which global folder that npm acts on. A backend that
 * inherited it runs the command against another prefix, prints "up to date",
 * exits 0, and changes nothing. Empty for every other manager.
 */
function prefixArgs(
  library: LibraryManager,
  nodeExecPath: string,
  platform: NodeJS.Platform,
): string[] {
  const prefix = npmPrefixFor(library, nodeExecPath, platform);
  return prefix ? ['--prefix', prefix] : [];
}

/** `<manager> <install verb>` for a package, with the launcher resolved. */
export function buildInstallSpec(
  coord: InstallCoordinate,
  nodeExecPath: string,
  packageName: string = EXTEND_KIT_PACKAGE,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec {
  const library = installManagerFor(coord);
  const command = launcherFor(library, nodeExecPath, platform, exists);
  const pfx = prefixArgs(library, nodeExecPath, platform);
  switch (library) {
    case LibraryManager.VOLTA:
      // volta keeps each package in its own directory and links the bins; an
      // `npm i -g` under volta bypasses that store entirely.
      return { command, args: ['install', packageName] };
    case LibraryManager.PNPM:
      return { command, args: ['add', '-g', packageName] };
    case LibraryManager.YARN:
      return { command, args: ['global', 'add', packageName] };
    case LibraryManager.BUN:
      return { command, args: ['add', '-g', packageName] };
    default:
      return { command, args: ['install', '-g', ...pfx, packageName] };
  }
}

/** `<manager> <uninstall verb>` for one specific library manager. */
export function buildUninstallSpecFor(
  library: LibraryManager,
  packageName: string,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec {
  const command = launcherFor(library, nodeExecPath, platform, exists);
  const pfx = prefixArgs(library, nodeExecPath, platform);
  switch (library) {
    case LibraryManager.VOLTA:
      return { command, args: ['uninstall', packageName] };
    case LibraryManager.PNPM:
      return { command, args: ['remove', '-g', packageName] };
    case LibraryManager.YARN:
      return { command, args: ['global', 'remove', packageName] };
    case LibraryManager.BUN:
      return { command, args: ['remove', '-g', packageName] };
    default:
      return { command, args: ['uninstall', '-g', ...pfx, packageName] };
  }
}

/** The removal command for the coordinate an install would use. */
export function buildUninstallSpec(
  coord: InstallCoordinate,
  packageName: string,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec {
  return buildUninstallSpecFor(installManagerFor(coord), packageName, nodeExecPath, platform, exists);
}

/**
 * Removal commands for EVERY store that could hold a copy, best candidate first.
 *
 * Installing targets one store; removing must not. A machine can hold the same
 * package twice — the exact case this module was rewritten for: volta's own
 * store held 0.4.0 while `npm i -g` under volta's Node held 0.3.0, and
 * `volta uninstall` cleared only the first. The version line then honestly
 * reported the survivor, which reads as "delete did nothing".
 *
 * The coordinate's own manager goes first so the common case is one command;
 * the rest follow and are no-ops when they hold nothing. Callers should treat a
 * failure from a store that has no copy as expected, not as an error.
 */
export function buildUninstallSpecsForAllStores(
  coord: InstallCoordinate,
  packageName: string,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec[] {
  const primary = installManagerFor(coord);
  const ordered = [primary, ...ALL_LIBRARY_MANAGERS.filter((m) => m !== primary)];
  return ordered.map((m) => buildUninstallSpecFor(m, packageName, nodeExecPath, platform, exists));
}

/** Legacy single-value view, for the wire format and the CLI-update UI. */
export function packageManagerFor(coord: InstallCoordinate): PackageManager {
  return toPackageManager(coord);
}
