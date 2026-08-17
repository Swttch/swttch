import { homedir } from 'os';
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
  buildUninstallSpecsForAllStores,
} from '../global-install-target';

// Removal only unlinks what is on disk, but a registry-backed manager can still
// be slow; reuse the install window rather than a tight one that would report a
// false failure.
const UNINSTALL_TIMEOUT_MS = 180_000;
const UNINSTALL_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * UNINSTALL_CCB — remove the kit from EVERY store that holds a copy.
 *
 * The obvious implementation removes it with the manager that would install it
 * today, and that is not enough. A machine can hold the same package twice, and
 * this one did: volta's own package store held 0.4.0 while `npm i -g` under
 * volta's Node held 0.3.0. `volta uninstall` cleared the first and never touched
 * the second, so the version line honestly reported the survivor — which reads,
 * correctly, as "I pressed delete and it is still there".
 *
 * The two stores are different coordinates under the same runtime (see
 * install-coordinate.ts), so no single manager name can name them both. Instead
 * every known store is asked to remove the package. A store that holds nothing
 * fails or no-ops, which is expected and not reported: the ONLY thing that
 * decides success is whether the kit can still be resolved afterwards.
 *
 * That last check is what makes this honest. Rather than trusting exit codes
 * from five different tools, we re-resolve the kit and report failure if a copy
 * survived — and hand back the exact command for the store we could not clear.
 */
export async function uninstallCcbHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const claudePaths = await resolveClaudePaths();
  const coord = resolveInstallCoordinate(claudePaths, process.execPath, home);
  const specs = buildUninstallSpecsForAllStores(coord, EXTEND_KIT_PACKAGE, process.execPath);

  console.log(
    'extend-kit uninstall\n',
    JSON.stringify({ coord, specs, node: process.execPath }),
    '\n',
  );

  // Ordered so the coordinate's own store goes first; the rest are sweeps.
  const attempts: Array<{ command: string; args: string[]; ok: boolean; output: string }> = [];
  for (const { command, args } of specs) {
    const { ok, output } = await runLauncher(command, args, {
      timeout: UNINSTALL_TIMEOUT_MS,
      maxBuffer: UNINSTALL_MAX_BUFFER,
    });
    attempts.push({ command, args, ok, output });
  }

  // The caches remember where the kit WAS; the verification below has to look at
  // the disk as it is now, not at that memory.
  resetUsageCache();
  resetExtendKitCache();

  const survivor = await getExtendKitVersion();
  if (survivor) {
    // Something still holds a copy. Prefer telling the user about a permission
    // problem — that is actionable — over a bare "still installed".
    const blocked = attempts.find((a) => !a.ok && isPermissionFailure(a.output));
    const error = blocked
      ? permissionErrorMessage(blocked.command, blocked.args, blocked.output)
      : `${EXTEND_KIT_PACKAGE} ${survivor} is still installed after removing it from every store this backend knows. It may have been installed by a tool that is not on this machine's PATH.`;
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
    return;
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
