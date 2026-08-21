import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { runLauncher } from '../run-launcher';
import { MessageType } from '../../shared';
import { isPermissionFailure, permissionErrorMessage } from './updateCli';
import { resetUsageCache } from './getUsage';
import { resetExtendKitCache, getExtendKitVersion } from '../extend-kit';
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
 * How many times an install that REPORTS success may be run before giving up.
 *
 * Two, because the second one is what the reporter in #298 did by hand: the same
 * command, unchanged, and the kit appeared. Whatever leaves a first run finished
 * but unfindable — a half-written package directory, a link npm had not yet
 * completed — a plain re-run resolves, and re-running an install is safe by
 * construction: `npm i -g` on an already-present package is a no-op.
 */
const INSTALL_ATTEMPTS = 2;

/**
 * Is the kit actually loadable now?
 *
 * The lookup deliberately goes through {@link getExtendKitVersion}, the same
 * resolution dictation uses to LOAD the kit, rather than reading the installer's
 * output. Every failure in #298's history is a command that succeeded against a
 * place the loader never reads — a different Node's global folder, volta's own
 * store, an `npm_config_prefix` redirect — so parsing "added N packages" would
 * confirm the one thing that was never in doubt while missing the thing that
 * actually breaks. Asking the loader collapses install-target and load-target
 * into a single question, which is the only one the user cares about.
 *
 * The cache is dropped first: it holds "found nowhere" from before the install,
 * and reading through it would report every fresh install as missing.
 */
async function kitIsLoadable(): Promise<boolean> {
  resetExtendKitCache();
  try {
    return (await getExtendKitVersion()) !== null;
  } catch {
    // A lookup that throws is not a found kit.
    return false;
  }
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
 * terminal, reusing updateCli's classification.
 *
 * Success is CONFIRMED, not assumed: an exit code of 0 says the command ran,
 * while every bug in this issue's history is a command that ran fine against a
 * place the loader never reads. So the kit is looked up afterwards through the
 * same resolution dictation loads it with, and a first miss re-runs the install
 * once — the reporter's own workaround. Only a kit we can actually find acks ok.
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

  for (let attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt++) {
    let result = await run(command, args);
    if (!result.ok && isBlockedByPredecessor(result.output)) {
      // The predecessor still owns `ccb` from an install that predates the
      // rename. The two ship the same code — the old package is a re-export
      // shell — so removing it loses nothing, and asking the user to do it by
      // hand for a name collision we created ourselves would be the wrong way
      // round.
      //
      // Removal must use the manager that owns the collision: uninstalling with
      // the wrong tool leaves the shim in place and the retry fails identically.
      const rm = buildUninstallSpec(coord, PREDECESSOR_PACKAGE, process.execPath);
      await run(rm.command, rm.args);
      result = await run(command, args);
    }

    if (!result.ok) {
      // The command itself failed, which is a different thing from an install
      // that cannot be found afterwards: there is nothing for a re-run to
      // settle, so report it now rather than making the user wait through a
      // second identical failure.
      //
      // A global install location the non-interactive backend cannot write to
      // (sudo-needing system PM, admin-only Program Files) is the common case.
      // Don't fail silently — hand back the exact command to run in a terminal.
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

    // Exit code 0 means the command ran, not that the kit is there. Confirm it
    // by finding the package the way dictation will, and only then call it done.
    if (await kitIsLoadable()) {
      // Next usage fetch should re-run ccb rather than serve the cached error.
      resetUsageCache();
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'ok',
      });
      return;
    }

    console.log(
      'extend-kit install reported success but the kit was not found\n',
      JSON.stringify({ attempt, of: INSTALL_ATTEMPTS, command, args }),
      '\n',
    );
  }

  // Installed by every measure the command offers, and still not loadable. We
  // cannot honestly call this a failure (nothing failed) and the user has no use
  // for our lookup's troubles, so the message says only what happened and what
  // to do — the same re-run that worked for the reporter.
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'error',
    error: `The ${EXTEND_KIT_PACKAGE} installation did not complete. Please try again.`,
  });
}
