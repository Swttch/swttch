import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { runLauncher } from '../run-launcher';
import { MessageType } from '../../shared';
import { isPermissionFailure, permissionErrorMessage } from './updateCli';
import { resetUsageCache } from './getUsage';
import { resetExtendKitCache } from '../extend-kit';
import { resolveClaudePaths } from './getCliUpdateInfo';
import {
  EXTEND_KIT_PACKAGE,
  resolveInstallCoordinate,
  buildInstallSpec,
  buildUninstallSpec,
} from '../global-install-target';
import { homedir } from 'os';

/** The executable both packages provide; the reason they cannot coexist under volta. */
const CCB_BINARY = 'ccb';
/** What this package used to be called, before it moved into the Swttch kit. */
const PREDECESSOR_PACKAGE = 'claude-code-battery';
// A global npm install downloads + links; allow a generous window.
const INSTALL_TIMEOUT_MS = 180_000;
const INSTALL_MAX_BUFFER = 10 * 1024 * 1024;

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
 * All three install affordances (the composer banner's button, and the settings
 * section's install and update buttons) send this one message, and the target is
 * resolved by [detectGlobalInstallManager] — the same resolution the "paste this
 * into a terminal" hint uses, so the command we run and the command we suggest
 * can never diverge.
 *
 * The manager is taken from the `claude` binary the user runs in a terminal when
 * there is one, falling back to the Node running this backend. Both matter: the
 * kit must land where the terminal's tooling puts global packages AND where this
 * backend's Node can load it from, and asking only one of them is what made
 * #298 — the install ran `npm i -g` through whatever npm PATH surfaced, wrote to
 * a different Node's global folder, reported success, and left the loader
 * finding nothing.
 *
 * The command runs through [runLauncher], the SAME runner the CLI updater uses,
 * so installing the kit resolves the launcher exactly the way updating the CLI
 * does on every platform — no separate login-shell path that could stall.
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
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const claudePaths = await resolveClaudePaths();
  const coord = resolveInstallCoordinate(claudePaths, process.execPath, home);

  const { command, args } = buildInstallSpec(coord, process.execPath);

  console.log(
    'extend-kit install\n',
    JSON.stringify({ coord, command, args, claudePaths, node: process.execPath }),
    '\n',
  );

  let result = await run(command, args);
  if (!result.ok && isBlockedByPredecessor(result.output)) {
    // The predecessor still owns `ccb` from an install that predates the rename.
    // The two ship the same code — the old package is a re-export shell — so
    // removing it loses nothing, and asking the user to do it by hand for a name
    // collision we created ourselves would be the wrong way round.
    //
    // Removal must use the manager that owns the collision: uninstalling with
    // the wrong tool leaves the shim in place and the retry fails identically.
    const rm = buildUninstallSpec(coord, PREDECESSOR_PACKAGE, process.execPath);
    await run(rm.command, rm.args);
    result = await run(command, args);
  }

  if (!result.ok) {
    // A global install location the non-interactive backend cannot write to
    // (sudo-needing system PM, admin-only Program Files). Don't fail silently —
    // tell the user to run it in a terminal, with the exact command.
    const error = isPermissionFailure(result.output)
      ? permissionErrorMessage(command, args, result.output)
      : result.output || `${EXTEND_KIT_PACKAGE} install failed`;
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
