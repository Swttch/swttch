import { posix as posixPath, win32 as win32Path } from 'node:path';
import {
  RuntimeManager,
  LibraryManager,
  AppChannel,
  PackageManager,
  type InstallCoordinate,
} from '../shared';

/**
 * Where a global npm package lives, as a COORDINATE rather than a single name.
 *
 * ## Why three axes
 *
 * "Which package manager does this machine use" sounds like one question and is
 * three. Answering it with one enum is what let a delete miss a copy: the kit
 * was removed with `volta uninstall`, which cleared volta's own package store,
 * while a second copy installed by `npm i -g` under volta's Node stayed exactly
 * where it was and kept being reported as installed.
 *
 *   runtime  — who installed NODE (volta, nvm, fnm, asdf, mise, brew, …)
 *   library  — who installs npm PACKAGES (npm, pnpm, yarn, bun, volta)
 *   channel  — who ships the `claude` APP, when it is not an npm package
 *              (native installer, Homebrew cask, WinGet, distro)
 *
 * They are independent. `brew install node` (runtime=homebrew) with `npm i -g`
 * (library=npm) is an ordinary setup, and so is volta (runtime=volta) with
 * `pnpm add -g` (library=pnpm). Collapsing them loses exactly the distinction
 * CRUD needs: install, read, update and delete must all address ONE store.
 *
 * volta appears in two axes on purpose — it really does both jobs.
 *
 * Every function here is pure and parameterised over paths/home/platform, so the
 * whole matrix is testable without touching the real machine.
 */

/** Normalised, lowercased path list for substring matching. */
function normalise(paths: Array<string | null | undefined>): string[] {
  return paths
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => p.replace(/\\/g, '/').toLowerCase());
}

/**
 * Which tool installed the Node these paths belong to.
 *
 * Order matters: several managers keep their versions under `~/.local` or
 * `~/Library`, so the specific markers are tested before the generic ones, and
 * `system` is only concluded once nothing else matched.
 */
export function detectRuntimeManager(
  paths: Array<string | null | undefined>,
  home: string,
  _platform: NodeJS.Platform = process.platform,
): RuntimeManager {
  const c = normalise(paths);
  if (c.length === 0) return RuntimeManager.UNKNOWN;
  const has = (needle: string) => c.some((p) => p.includes(needle));

  // volta: ~/.volta/tools/image/{node,npm,yarn,packages}/… and the shared shim.
  if (has('/.volta/') || has('/volta/') || has('volta-shim')) return RuntimeManager.VOLTA;
  // nvm is a SHELL FUNCTION — never a binary on PATH — so only the version dir
  // it creates can identify it. `command -v nvm` finds nothing even when in use.
  if (has('/.nvm/')) return RuntimeManager.NVM;
  // fnm's macOS default lives under a path WITH SPACES; matched by name only.
  if (has('/.fnm/') || has('/fnm/node-versions/') || has('/fnm_multishells/')) {
    return RuntimeManager.FNM;
  }
  if (has('/.asdf/installs/nodejs/') || has('/.asdf/')) return RuntimeManager.ASDF;
  if (has('/mise/installs/node/') || has('/.mise/') || has('/rtx/installs/node/')) {
    return RuntimeManager.MISE;
  }
  if (has('/.nodenv/')) return RuntimeManager.NODENV;
  if (has('/.proto/tools/node/')) return RuntimeManager.PROTO;
  if (has('/.nvs/')) return RuntimeManager.NVS;
  // Homebrew's node FORMULA (not the claude cask — that is an AppChannel).
  if (has('/opt/homebrew/') || has('/cellar/') || has('/homebrew/')) {
    return RuntimeManager.HOMEBREW;
  }

  // `n` installs into a prefix and leaves no marker of its own, so a plain
  // /usr/local or /usr Node is reported as system: both are "someone else's
  // Node", which is all the caller needs to know.
  const h = home.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  if (has('/usr/local/') || has('/usr/bin/') || has('/opt/nodejs/') || has('program files')) {
    return RuntimeManager.SYSTEM;
  }
  if (h && c.some((p) => p.startsWith(`${h}/.local/`))) return RuntimeManager.SYSTEM;

  return RuntimeManager.UNKNOWN;
}

/**
 * Which tool installs global npm packages here, judged from the path a package
 * (or its binary) actually resolves to.
 *
 * This asks about a PACKAGE's location, not about Node's. `~/Library/pnpm/...`
 * means pnpm owns it no matter which Node is active; `.../volta/tools/image/
 * packages/...` means volta's own store; anything under a Node's
 * `lib/node_modules` (including a volta-managed Node's) means plain npm.
 */
export function detectLibraryManager(
  paths: Array<string | null | undefined>,
  _home: string,
  _platform: NodeJS.Platform = process.platform,
): LibraryManager {
  const c = normalise(paths);
  if (c.length === 0) return LibraryManager.UNKNOWN;
  const has = (needle: string) => c.some((p) => p.includes(needle));

  // volta's OWN store — must be tested before the generic /.volta/ runtime
  // marker, because a volta-managed Node's npm globals live under /.volta/ too
  // and are NOT volta packages. That exact overlap is the bug this module
  // exists for: `volta uninstall` clears the first and never touches the second.
  //
  // The directory is `~/.volta/tools/image/packages/`, so the marker cannot
  // start with `/volta/` — the segment carries a leading dot. Matching on
  // `tools/image/packages/` keeps it independent of where volta's home lives
  // (VOLTA_HOME can move it).
  if (has('volta/tools/image/packages/')) return LibraryManager.VOLTA;

  if (has('/pnpm/') || has('/.pnpm/') || has('pnpm/global/')) return LibraryManager.PNPM;
  if (has('/.yarn/') || has('/yarn/global/') || has('/.config/yarn/')) return LibraryManager.YARN;
  if (has('/.bun/install/global/')) return LibraryManager.BUN;

  // Any Node's global folder, on either platform layout, is npm's.
  if (has('/lib/node_modules/') || has('/npm/node_modules/') || has('/node_modules/')) {
    return LibraryManager.NPM;
  }
  if (has('/.npm-global/') || has('/appdata/roaming/npm')) return LibraryManager.NPM;

  return LibraryManager.UNKNOWN;
}

/**
 * Which app channel shipped `claude`, when it did not come from an npm-style
 * manager. NONE means it did — the library axis is the one that describes it.
 */
export function detectAppChannel(
  paths: Array<string | null | undefined>,
  home: string,
  _platform: NodeJS.Platform = process.platform,
): AppChannel {
  const c = normalise(paths);
  if (c.length === 0) return AppChannel.NONE;
  const has = (needle: string) => c.some((p) => p.includes(needle));

  // An npm-style install wins: a path inside any package store is not an app
  // channel, even when it also sits under /opt/homebrew (brew's node + npm i -g).
  if (detectLibraryManager(paths, home) !== LibraryManager.UNKNOWN) return AppChannel.NONE;

  if (has('/winget/') || has('winget\\') || has('/microsoft/winget')) return AppChannel.WINGET;
  // Homebrew CASK (the app), as opposed to the node formula.
  if (has('/caskroom/') || has('claude-code@latest') || has('/cellar/claude')) {
    return AppChannel.HOMEBREW_CASK;
  }

  const h = home.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  if (
    has('/.local/share/claude') ||
    has('/.local/bin/claude') ||
    has('/.claude/local/') ||
    (h && c.some((p) => p.startsWith(`${h}/.claude/local/`)))
  ) {
    return AppChannel.NATIVE;
  }
  if (has('/usr/bin/') || has('/snap/')) return AppChannel.SYSTEM;

  return AppChannel.NONE;
}

/** The full coordinate for a set of paths. */
export function detectInstallCoordinate(
  paths: Array<string | null | undefined>,
  home: string,
  platform: NodeJS.Platform = process.platform,
): InstallCoordinate {
  return {
    runtime: detectRuntimeManager(paths, home, platform),
    library: detectLibraryManager(paths, home, platform),
    channel: detectAppChannel(paths, home, platform),
  };
}

/**
 * Collapse a coordinate to the legacy single-value {@link PackageManager}.
 *
 * The wire format and the CLI-update UI still speak that enum, and changing it
 * would be a separate, user-visible change. This keeps the old answer exactly as
 * it was while the code above reasons in coordinates.
 */
export function toPackageManager(coord: InstallCoordinate): PackageManager {
  if (coord.channel === AppChannel.WINGET) return PackageManager.WINGET;
  if (coord.channel === AppChannel.HOMEBREW_CASK) return PackageManager.HOMEBREW;
  if (coord.channel === AppChannel.NATIVE) return PackageManager.NATIVE;

  switch (coord.library) {
    case LibraryManager.VOLTA:
      return PackageManager.VOLTA;
    case LibraryManager.PNPM:
      return PackageManager.PNPM;
    case LibraryManager.YARN:
      return PackageManager.YARN;
    case LibraryManager.NPM:
      return PackageManager.NPM;
    default:
      break;
  }

  // No package path to go on: fall back to what the runtime implies, which is
  // what the old single-axis detector did with a Node path.
  if (coord.runtime === RuntimeManager.VOLTA) return PackageManager.VOLTA;
  if (coord.runtime === RuntimeManager.HOMEBREW) return PackageManager.HOMEBREW;
  if (
    coord.runtime === RuntimeManager.NVM ||
    coord.runtime === RuntimeManager.FNM ||
    coord.runtime === RuntimeManager.NODENV ||
    coord.runtime === RuntimeManager.ASDF ||
    coord.runtime === RuntimeManager.MISE ||
    coord.runtime === RuntimeManager.PROTO ||
    coord.runtime === RuntimeManager.NVS
  ) {
    // These manage Node only; global packages under them belong to npm.
    return PackageManager.NPM;
  }
  return PackageManager.UNKNOWN;
}

/** Managers that can install an npm package. An app channel cannot. */
export function canInstallNpmPackages(library: LibraryManager): boolean {
  return library !== LibraryManager.UNKNOWN;
}

/**
 * EVERY library manager that could hold a copy on this machine.
 *
 * Deleting has to consider all of them, not just the one that would install
 * today: a package can predate the current setup, or have been installed by
 * hand with a different tool. Reporting one store as "the" location is what let
 * a delete succeed while a second copy survived.
 */
export const ALL_LIBRARY_MANAGERS: readonly LibraryManager[] = [
  LibraryManager.VOLTA,
  LibraryManager.NPM,
  LibraryManager.PNPM,
  LibraryManager.YARN,
  LibraryManager.BUN,
] as const;

/**
 * The launcher binary for a library manager, pinned to an absolute path when
 * that is the only way to be sure which one runs.
 *
 * npm is the case that needs pinning: a GUI backend's PATH is the IDE's, not the
 * user's, so a bare `npm` can belong to a different Node than the one executing
 * this code — and installing with it writes to a global folder this backend
 * never reads (#298). The npm next to the running Node is by construction the
 * one whose global folder this Node resolves from.
 *
 * The others keep their own stores, unrelated to any Node prefix, so a PATH
 * lookup is correct for them and an absolute guess would be wrong.
 */
export function launcherFor(
  library: LibraryManager,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = () => false,
): string {
  if (library !== LibraryManager.NPM) {
    return library === LibraryManager.UNKNOWN ? 'npm' : library;
  }

  // Path handling follows the TARGET platform, not the one this code runs on.
  const p = platform === 'win32' ? win32Path : posixPath;
  const binDir = p.dirname(nodeExecPath);
  // Both platforms keep npm beside node; only the filename differs. Windows
  // ships npm.cmd, which runs in Command Prompt, PowerShell and Git Bash alike
  // (npm.ps1 is blocked by the default execution policy).
  const candidates =
    platform === 'win32'
      ? [p.join(binDir, 'npm.cmd'), p.join(binDir, 'npm.exe')]
      : [p.join(binDir, 'npm')];
  return candidates.find((c) => exists(c)) ?? (platform === 'win32' ? 'npm.cmd' : 'npm');
}

/**
 * The npm `--prefix` that pins a global command to THIS Node's global folder.
 *
 * Choosing the right npm binary is not enough. npm resolves its global root
 * from configuration, and `npm_config_prefix` in the environment overrides
 * everything — including which npm you ran. A backend that inherits that
 * variable (from the IDE, a shell profile, or a project's tooling) will run
 * `npm uninstall -g` against a completely different prefix, print
 * "up to date", exit 0, and remove nothing. Measured exactly that: with
 * `npm_config_prefix` set, the package survived a successful-looking uninstall;
 * adding `--prefix` removed it.
 *
 * That is the same failure shape as the install bug this work started from — a
 * command that succeeds against the wrong place — so the fix belongs here
 * rather than in one caller.
 *
 *   unix   <prefix>/bin/node  → prefix is the directory ABOVE bin
 *   win32  <prefix>\node.exe  → prefix is that directory itself
 *
 * Returns null for non-npm managers, which keep their own stores and have no
 * equivalent flag.
 */
export function npmPrefixFor(
  library: LibraryManager,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (library !== LibraryManager.NPM) return null;
  const p = platform === 'win32' ? win32Path : posixPath;
  const binDir = p.dirname(nodeExecPath);
  return platform === 'win32' ? binDir : p.dirname(binDir);
}
