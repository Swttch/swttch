import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Command, ShellKind } from '../command';
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
  const manager = detectPackageManager([process.execPath], homedir());
  switch (manager) {
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

/** Run one install-related command the way this backend runs them. */
function run(command: string, args: string[]): Promise<unknown> {
  return new Command(command, args, {
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: INSTALL_MAX_BUFFER,
    // unix: resolve the launcher via the login shell's PATH (win32 ignores this
    // and uses its cmd.exe argv path). Mirrors runCcbUsage so install and usage
    // agree about where commands come from.
    shell: ShellKind.LoginInteractive,
  }).exec();
}

/** Command.exec attaches stdout/stderr to the rejection; npm and volta report failures there. */
function errorOutput(err: unknown): string {
  const e = err as { stdout?: string; stderr?: string; message?: string };
  return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message || '';
}

/**
 * Did the install fail only because the old package still owns the `ccb` name?
 *
 * volta says so explicitly ("Executable 'ccb' is already installed by
 * claude-code-battery"), and it is the only manager that enforces this — npm
 * lets the two sit side by side. Matched on both the executable and the package
 * name so an unrelated collision does not trigger an uninstall.
 */
function isBlockedByPredecessor(output: string): boolean {
  return output.includes(CCB_BINARY) && output.includes(PREDECESSOR_PACKAGE);
}

/**
 * INSTALL_CCB — install (or update) the kit the usage panel and voice input
 * depend on, so the user never has to leave the GUI or pick a shell.
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
  try {
    try {
      await run(command, args);
    } catch (err) {
      // volta refuses to install a package whose executable name another
      // package already owns, and `ccb` is still owned by the kit's predecessor
      // on machines that installed it before the rename. The two ship the same
      // code — the old package is a re-export shell — so removing it loses
      // nothing, and asking the user to do it by hand for a name collision we
      // created ourselves would be the wrong way round.
      if (!isBlockedByPredecessor(errorOutput(err))) throw err;
      await run('volta', ['uninstall', PREDECESSOR_PACKAGE]);
      await run(command, args);
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
  } catch (err) {
    const output = errorOutput(err);
    const error = isPermissionFailure(output)
      ? permissionErrorMessage(command, args, output)
      : output || 'ccb install failed';
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
