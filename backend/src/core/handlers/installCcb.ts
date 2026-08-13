import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Command, ShellKind } from '../command';
import { MessageType } from '../../shared';
import { isPermissionFailure, permissionErrorMessage } from './updateCli';
import { resetUsageCache } from './getUsage';

// Kept in step with ccb-install-hint's constant — see the note there on why the
// package name and the `ccb` binary name differ.
const CCB_PACKAGE = '@swttch/extend-kit';
// A global npm install downloads + links; allow a generous window.
const INSTALL_TIMEOUT_MS = 180_000;
const INSTALL_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * INSTALL_CCB — install the `ccb` CLI the usage panel depends on, so the user
 * never has to leave the GUI or pick a shell. Runs `npm install -g
 * @swttch/extend-kit` through the Command core: on win32 that resolves via
 * cmd.exe (no PowerShell execution-policy wall — the exact problem the copy-paste
 * notice caused); on unix it runs through a login shell (LoginInteractive), the
 * SAME way runCcbUsage resolves ccb. A GUI-launched backend inherits a minimal
 * PATH, so exec'ing `npm` directly (Direct) would fail with ENOENT wherever only
 * the user's rc-file PATH exposes npm — the login shell sources those rc files.
 *
 * On a permission-blocked global location we don't fail silently — we hand back
 * the exact command (with sudo where needed) so the user can run it in a
 * terminal, reusing updateCli's classification. On success we clear the usage
 * cache so the next GET_USAGE re-runs ccb and the panel flips from the install
 * notice to real data.
 */
export async function installCcbHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const command = 'npm';
  const args = ['install', '-g', CCB_PACKAGE];
  try {
    await new Command(command, args, {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: INSTALL_MAX_BUFFER,
      // unix: resolve npm via the login shell's PATH (win32 ignores this and uses
      // its cmd.exe argv path). Mirrors runCcbUsage so install and usage agree.
      shell: ShellKind.LoginInteractive,
    }).exec();
    // Next usage fetch should re-run ccb rather than serve the cached error.
    resetUsageCache();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
    });
  } catch (err) {
    // Command.exec attaches stdout/stderr to the rejected error; npm reports a
    // permission failure in that text rather than as an errno.
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message || '';
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
