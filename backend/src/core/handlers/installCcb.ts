import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { runLauncher } from '../run-launcher';
import { MessageType } from '../../shared';
import { isPermissionFailure, permissionErrorMessage } from './updateCli';
import { resetUsageCache } from './getUsage';
import { resetExtendKitCache } from '../extend-kit';
import { detectPackageManager } from '../cli-update';
import { PackageManager } from '../../shared';
import { homedir } from 'os';

// Kept in step with ccb-install-hint's constant — see the note there on why the
// package name and the `ccb` binary name differ.
const CCB_PACKAGE = '@swttch/extend-kit';
/** The executable both packages provide; the reason they cannot coexist under volta. */
const CCB_BINARY = 'ccb';
/** What this package used to be called, before it moved into the Swttch kit. */
const PREDECESSOR_PACKAGE = 'claude-code-battery';
// A global npm install downloads + links; allow a generous window.
const INSTALL_TIMEOUT_MS = 180_000;
const INSTALL_MAX_BUFFER = 10 * 1024 * 1024;

/** Which manager owns this machine's global packages, from the running Node. */
function currentManager(): PackageManager {
  return detectPackageManager([process.execPath], homedir());
}

/**
 * How to install a global npm package on this machine.
 *
 * The manager is detected from where the running Node lives, which is the Node
 * that will later load the kit — so whatever installs it puts it somewhere that
 * Node can see. Detection is shared with the CLI updater so the two never
 * disagree about what this machine uses.
 *
 * Only the Node package managers appear here. NATIVE/HOMEBREW/WINGET distribute
 * Claude Code itself and cannot install an npm package, so those fall back to
 * npm, as does UNKNOWN.
 */
function resolveInstallCommand(): { command: string; args: string[] } {
  switch (currentManager()) {
    case PackageManager.VOLTA:
      // volta keeps each package in its own directory and links the bins; `npm
      // i -g` under volta bypasses that and lands in whichever Node's global
      // folder the shell's npm belongs to.
      return { command: 'volta', args: ['install', CCB_PACKAGE] };
    case PackageManager.PNPM:
      return { command: 'pnpm', args: ['add', '-g', CCB_PACKAGE] };
    case PackageManager.YARN:
      return { command: 'yarn', args: ['global', 'add', CCB_PACKAGE] };
    default:
      return { command: 'npm', args: ['install', '-g', CCB_PACKAGE] };
  }
}

/**
 * How to remove the predecessor with the manager that owns the collision, so the
 * retry can claim the `ccb` name. Must match {@link resolveInstallCommand}'s
 * manager — uninstalling with the wrong tool would leave the shim in place and
 * the retry would fail the same way.
 */
function resolveUninstallPredecessorCommand(): { command: string; args: string[] } {
  switch (currentManager()) {
    case PackageManager.VOLTA:
      return { command: 'volta', args: ['uninstall', PREDECESSOR_PACKAGE] };
    case PackageManager.PNPM:
      return { command: 'pnpm', args: ['remove', '-g', PREDECESSOR_PACKAGE] };
    case PackageManager.YARN:
      return { command: 'yarn', args: ['global', 'remove', PREDECESSOR_PACKAGE] };
    default:
      return { command: 'npm', args: ['uninstall', '-g', PREDECESSOR_PACKAGE] };
  }
}

/** Run one install-related command through the shared launcher runner. */
function run(command: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return runLauncher(command, args, { timeout: INSTALL_TIMEOUT_MS, maxBuffer: INSTALL_MAX_BUFFER });
}

/**
 * Did the install fail only because the old package still owns the `ccb` name?
 *
 * Two managers report the same collision differently. volta names it outright
 * ("Executable 'ccb' is already installed by claude-code-battery"). npm (and
 * pnpm/yarn) instead fail with EEXIST on the `ccb` shim they cannot overwrite —
 * `EEXIST: file exists, .../ccb.cmd` — and never name the package. Both are the
 * predecessor still holding `ccb` from an install that predates the rename, so
 * both must trigger the same removal-and-retry; only npm's is silent about why.
 *
 * The EEXIST branch is gated on the `ccb` binary name so an unrelated file
 * collision does not take the old package down with it. The removal itself is a
 * no-op when the predecessor is absent, so a false match costs one wasted
 * uninstall and the real error still surfaces on the retry.
 */
function isBlockedByPredecessor(output: string): boolean {
  if (!output.includes(CCB_BINARY)) return false;
  return output.includes(PREDECESSOR_PACKAGE) || /EEXIST/i.test(output);
}

/**
 * INSTALL_CCB — install (or update) the kit the usage panel and voice input
 * depend on, so the user never has to leave the GUI or pick a shell.
 *
 * The command runs through [runLauncher], the SAME runner the CLI updater uses,
 * so installing the kit resolves the launcher exactly the way updating the CLI
 * does on every platform — no separate login-shell path that could stall.
 *
 * The install goes through the manager that owns this machine's global packages
 * rather than `npm` regardless, because those are not always the same place.
 * Under volta, `npm i -g` through a login shell installed into /opt/homebrew —
 * a different Node's global folder than the one the backend loads the kit from.
 * It succeeded, said so, and changed nothing the user could see.
 *
 * On a permission-blocked global location we don't fail silently — we hand back
 * the exact command (with sudo where needed) so the user can run it in a
 * terminal, reusing updateCli's classification. On success both caches are
 * cleared so the next lookup sees the new install rather than the old answer.
 */
export async function installCcbHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { command, args } = resolveInstallCommand();

  let result = await run(command, args);
  if (!result.ok && isBlockedByPredecessor(result.output)) {
    // The predecessor still owns `ccb` from an install that predates the rename.
    // The two ship the same code — the old package is a re-export shell — so
    // removing it loses nothing, and asking the user to do it by hand for a name
    // collision we created ourselves would be the wrong way round.
    const rm = resolveUninstallPredecessorCommand();
    await run(rm.command, rm.args);
    result = await run(command, args);
  }

  if (!result.ok) {
    // A global install location the non-interactive backend cannot write to
    // (sudo-needing system PM, admin-only Program Files). Don't fail silently —
    // tell the user to run it in a terminal, with the exact command.
    const error = isPermissionFailure(result.output)
      ? permissionErrorMessage(command, args, result.output)
      : result.output || 'ccb install failed';
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
    return;
  }

  // Next usage fetch should re-run ccb rather than serve the cached error.
  resetUsageCache();
  // The loader caches where it looked for the kit, including having found it
  // nowhere. Without this the install succeeds and every later lookup still
  // answers from that cache, so the version on screen never moves.
  resetExtendKitCache();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
