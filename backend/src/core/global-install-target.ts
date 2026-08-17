import { posix as posixPath, win32 as win32Path } from 'node:path';
import { existsSync } from 'node:fs';
import { PackageManager } from '../shared';
import { detectPackageManager } from './cli-update';

/** The npm package the voice input and the usage panel both load. */
export const EXTEND_KIT_PACKAGE = '@swttch/extend-kit';

/**
 * WHERE a global npm package must be installed so THIS backend can load it.
 *
 * Three screens can install the kit — the composer's install banner, and the
 * settings section's install and update buttons — and a fourth surface tells the
 * user what to paste into a terminal. All four resolve the target here, so they
 * cannot disagree about which manager owns this machine's global packages. They
 * did disagree before: the installer asked only `process.execPath` while the CLI
 * updater asked the `claude` binary's paths, and the paste-me hint asked nothing
 * at all and always said `npm`.
 *
 * Two rules decide the answer, in this order:
 *
 * 1. If `claude` is on PATH, its install method wins. A user who runs `claude`
 *    in a terminal has already told us which manager owns their Node tooling,
 *    and the kit has to end up in the same world. This is the project's CLI
 *    equivalence rule applied to installs: whatever the terminal does, we do.
 *
 * 2. Otherwise fall back to the Node running this backend. Without a `claude`
 *    to ask, the Node that will later `require` the kit is the only evidence of
 *    where a global install would be visible from.
 *
 * The manager alone is not enough, though — see {@link resolveLauncher} for why
 * the launcher is pinned to a path rather than left to PATH.
 */
export function detectGlobalInstallManager(
  claudePaths: Array<string | null | undefined>,
  nodeExecPath: string,
  home: string,
): PackageManager {
  // Rule 1 — the `claude` the user runs in a terminal, when we could find one.
  const fromClaude = detectPackageManager(claudePaths, home);
  if (fromClaude !== PackageManager.UNKNOWN) return fromClaude;

  // Rule 2 — the Node that will load the kit.
  return detectPackageManager([nodeExecPath], home);
}

/**
 * Managers that distribute Claude Code itself but cannot install an npm package.
 *
 * HOMEBREW/NATIVE/WINGET can all be the honest answer to "how was `claude`
 * installed", and none of them can put `@swttch/extend-kit` anywhere. They fall
 * through to npm — but to the npm belonging to the backend's own Node, not to
 * whichever npm PATH happens to surface. That distinction is the whole of #298:
 * `npm i -g` through a stray PATH entry installs into a DIFFERENT Node's global
 * folder, succeeds, reports success, and leaves the kit invisible to the loader.
 */
function usesNpmFallback(pm: PackageManager): boolean {
  return (
    pm === PackageManager.HOMEBREW ||
    pm === PackageManager.NATIVE ||
    pm === PackageManager.WINGET ||
    pm === PackageManager.UNKNOWN
  );
}

/** The manager whose CLI actually performs the install. */
export function installManagerFor(pm: PackageManager): PackageManager {
  return usesNpmFallback(pm) ? PackageManager.NPM : pm;
}

/**
 * The launcher binary to run, resolved to an absolute path when we can.
 *
 * A bare `npm` is looked up on PATH, and a GUI-launched backend's PATH is not
 * the user's — it is whatever the IDE inherited, plus the well-known bins
 * augmentedPath() appends. Under that PATH the first `npm` can easily belong to
 * a different Node than the one executing this code, and installing with it puts
 * the package in a global folder this backend never reads.
 *
 * So for npm we prefer the npm sitting next to the running Node
 * (`dirname(process.execPath)/npm`), which is by construction the npm whose
 * global folder this Node resolves from. Everything else (volta/pnpm/yarn) keeps
 * its own store that is not tied to a Node prefix, so a PATH lookup is correct
 * for them and an absolute guess would be wrong.
 *
 * Falls back to the bare name when the sibling is absent (a Node installed
 * without npm, or Windows layouts we did not guess) — that is the old behaviour,
 * which is no worse than before.
 */
export function resolveLauncher(
  manager: PackageManager,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): string {
  if (manager !== PackageManager.NPM) return manager;

  // Path handling follows the TARGET platform, not the one this code runs on:
  // the function takes `platform` as a parameter, so using the ambient
  // `path.join` would build `C:\Program Files\nodejs/npm.cmd` under a unix test
  // run and silently never match.
  const p = platform === 'win32' ? win32Path : posixPath;
  const binDir = p.dirname(nodeExecPath);

  // The two platforms put npm in DIFFERENT places relative to node:
  //   unix   <prefix>/bin/node  and  <prefix>/bin/npm     — same directory
  //   win32  <prefix>\node.exe  and  <prefix>\npm.cmd     — same directory too,
  //          because node.exe is not under a bin/ subdir there.
  // So the sibling lookup is correct on both; only the filename differs. npm
  // ships as a .cmd batch launcher on Windows (which runs in Command Prompt,
  // PowerShell and Git Bash alike, unlike npm.ps1 that the default execution
  // policy blocks).
  const candidates =
    platform === 'win32'
      ? [p.join(binDir, 'npm.cmd'), p.join(binDir, 'npm.exe')]
      : [p.join(binDir, 'npm')];
  return candidates.find((c) => exists(c)) ?? (platform === 'win32' ? 'npm.cmd' : 'npm');
}

export interface InstallSpec {
  command: string;
  args: string[];
}

/**
 * The command that installs (or updates — `-g` fetches the latest either way)
 * the kit for a given manager.
 *
 * Shared by the three install buttons AND by the paste-into-a-terminal hint, so
 * the command we run and the command we tell the user to run are the same
 * string. They were not before: the hint always said `npm install -g` even on a
 * machine where the button correctly ran `volta install`.
 */
export function buildInstallSpec(
  pm: PackageManager,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec {
  const manager = installManagerFor(pm);
  const command = resolveLauncher(manager, nodeExecPath, platform, exists);
  switch (manager) {
    case PackageManager.VOLTA:
      // volta keeps each package in its own directory and links the bins; `npm
      // i -g` under volta bypasses that entirely.
      return { command, args: ['install', EXTEND_KIT_PACKAGE] };
    case PackageManager.PNPM:
      return { command, args: ['add', '-g', EXTEND_KIT_PACKAGE] };
    case PackageManager.YARN:
      return { command, args: ['global', 'add', EXTEND_KIT_PACKAGE] };
    default:
      return { command, args: ['install', '-g', EXTEND_KIT_PACKAGE] };
  }
}

/** The matching removal command, for clearing the predecessor's `ccb` shim. */
export function buildUninstallSpec(
  pm: PackageManager,
  packageName: string,
  nodeExecPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): InstallSpec {
  const manager = installManagerFor(pm);
  const command = resolveLauncher(manager, nodeExecPath, platform, exists);
  switch (manager) {
    case PackageManager.VOLTA:
      return { command, args: ['uninstall', packageName] };
    case PackageManager.PNPM:
      return { command, args: ['remove', '-g', packageName] };
    case PackageManager.YARN:
      return { command, args: ['global', 'remove', packageName] };
    default:
      return { command, args: ['uninstall', '-g', packageName] };
  }
}
