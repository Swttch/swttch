import { homedir } from 'os';
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
  detectGlobalInstallManager,
  buildUninstallSpec,
} from '../global-install-target';

// Removal only unlinks what is already on disk, but a slow registry-backed
// manager can still take a while; reuse the install window rather than a tight
// one that would report a false failure.
const UNINSTALL_TIMEOUT_MS = 180_000;
const UNINSTALL_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * UNINSTALL_CCB — remove the kit with the manager that owns this machine's
 * global packages.
 *
 * Removal has to resolve the manager the SAME way installing does, through
 * [detectGlobalInstallManager]: uninstalling with the wrong tool is not a no-op
 * that fails loudly, it is a command that succeeds against a store the package
 * was never in. The user would be told it was removed while it stayed installed
 * and voice input kept working — the mirror image of #298.
 *
 * A permission-blocked global location is reported the way the installer and the
 * CLI updater report it: with the exact command to run in a terminal, rather
 * than a bare failure the user cannot act on.
 */
export async function uninstallCcbHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const claudePaths = await resolveClaudePaths();
  const manager = detectGlobalInstallManager(claudePaths, process.execPath, home);
  const { command, args } = buildUninstallSpec(manager, EXTEND_KIT_PACKAGE, process.execPath);

  console.log(
    'extend-kit uninstall\n',
    JSON.stringify({ manager, command, args, node: process.execPath }),
    '\n',
  );

  const { ok, output } = await runLauncher(command, args, {
    timeout: UNINSTALL_TIMEOUT_MS,
    maxBuffer: UNINSTALL_MAX_BUFFER,
  });

  if (!ok) {
    const error = isPermissionFailure(output)
      ? permissionErrorMessage(command, args, output)
      : output || `${EXTEND_KIT_PACKAGE} uninstall failed`;
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
    return;
  }

  // Both caches remember where the kit WAS. Left in place, the settings section
  // would keep reporting the removed version and dictation would keep trying to
  // load a module that is gone.
  resetUsageCache();
  resetExtendKitCache();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
