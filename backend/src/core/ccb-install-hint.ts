import { basename } from 'node:path';
import { LibraryManager, RuntimeManager, AppChannel, type InstallCoordinate } from '../shared';
import { buildInstallSpec, EXTEND_KIT_PACKAGE } from './global-install-target';

export interface CcbInstallHint {
  /** The exact command to paste, correct for this platform's shells. */
  command: string;
  /** Shells the command works in — a display hint for WHERE to paste it. */
  shells: string[];
}

// The npm package that ships the `ccb` binary. Note the two names differ: the
// package moved into the Swttch kit, the executable did not. That asymmetry is
// deliberate — `ccb` is a name users type and this backend exec's, so renaming
// it would make an already-installed command disappear. It also means we never
// have to uninstall anything: whoever installed the old claude-code-battery
// still has a working `ccb`, and installing the kit alongside it is harmless
// because both resolve to the same code.
export { EXTEND_KIT_PACKAGE };

/**
 * The command + shells a user should paste to install the kit themselves.
 *
 * The command comes from [buildInstallSpec], the SAME builder the install
 * buttons run, so what we tell the user to paste is what the GUI would have
 * run. It used to be a hardcoded `npm install -g` regardless of the machine,
 * which handed volta/pnpm/yarn users a command that installs into a place their
 * tooling does not read — the manual half of #298.
 *
 * The launcher is reported by BASENAME rather than the absolute path the
 * installer runs. The installer pins npm to the backend Node's sibling because
 * its PATH is the IDE's, not the user's; a terminal already has the user's PATH,
 * so a bare `npm` there resolves to the same tooling and is far easier to read
 * than `/Users/x/.nvm/versions/node/v22.14.0/bin/npm`.
 *
 * On win32 the basename keeps its `.cmd` extension: a bare `npm` resolves to
 * npm.ps1 in PowerShell, which the default execution policy blocks — the exact
 * wall a user hits pasting the old notice. `npm.cmd` runs in Command Prompt,
 * PowerShell and Git Bash alike.
 *
 * Pure and parameterised over manager/platform so it is unit-testable without
 * touching the real environment.
 */
export function ccbInstallHint(
  coord: InstallCoordinate = {
    runtime: RuntimeManager.UNKNOWN,
    library: LibraryManager.UNKNOWN,
    channel: AppChannel.NONE,
  },
  nodeExecPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
): CcbInstallHint {
  const spec = buildInstallSpec(coord, nodeExecPath, EXTEND_KIT_PACKAGE, platform);
  const launcher = basename(spec.command);
  // `--prefix` is stripped, along with the absolute path it carries. It exists
  // so the BACKEND cannot be redirected by an inherited `npm_config_prefix`; a
  // user's own terminal does not have that problem, and pasting one of our
  // internal paths would be both noise and wrong on their machine.
  const args = stripPrefixFlag(spec.args);
  return {
    command: [launcher, ...args].join(' '),
    shells: platform === 'win32' ? ['Command Prompt', 'PowerShell', 'Git Bash'] : ['Terminal'],
  };
}

/** Drop `--prefix <dir>` from an argv, leaving the rest untouched. */
function stripPrefixFlag(args: string[]): string[] {
  const at = args.indexOf('--prefix');
  return at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
}
