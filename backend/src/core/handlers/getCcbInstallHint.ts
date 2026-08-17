import { homedir } from 'os';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { ccbInstallHint } from '../ccb-install-hint';
import { detectGlobalInstallManager } from '../global-install-target';
import { resolveClaudePaths } from './getCliUpdateInfo';

/**
 * GET_CCB_INSTALL_HINT — the install command + shells for the "not installed"
 * notice, so a user copying the command by hand knows exactly what to paste and
 * where.
 *
 * Backend-owned because the right command depends on the machine the backend
 * runs on: not just the OS (win32 needs npm.cmd) but WHICH package manager owns
 * this machine's global packages. The manager is resolved by
 * [detectGlobalInstallManager] — the same call the install buttons make — so the
 * command shown here and the command those buttons run are the same one.
 */
export async function getCcbInstallHintHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const claudePaths = await resolveClaudePaths();
  const manager = detectGlobalInstallManager(claudePaths, process.execPath, home);
  const hint = ccbInstallHint(manager);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...hint,
  });
}
