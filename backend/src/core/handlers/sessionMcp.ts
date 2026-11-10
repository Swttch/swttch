import { homedir } from 'os';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { runLauncher } from '../run-launcher';
import { autoUpdateSessionMcp, waitForSessionMcpStartupUpdate } from '../extend-kit-update';
import { fetchDistTags, resolveClaudePaths } from './getCliUpdateInfo';
import { isNewerVersion } from '../cli-update';
import { isPermissionFailure, permissionErrorMessage } from './updateCli';
import {
  SESSION_MCP_PACKAGE,
  resolveInstallCoordinate,
  buildInstallSpec,
  buildUninstallSpecsForAllStores,
} from '../global-install-target';
import { getSessionMcpVersion, resolveSessionMcpEntry, resetSessionMcpCache } from '../session-mcp';

/**
 * The session-management MCP (`@swttch/session-manager-mcp`) is installed the way the extend kit
 * is: a global npm package the user adds from the settings screen, never bundled and never
 * imported. Installing and removing never happen on their own; each answers one message that the
 * settings screen sends after the user pressed (and confirmed) the button. Only keeping an
 * installed package current is automatic.
 */
const COMMAND_TIMEOUT_MS = 180_000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
/** Same as the kit: a second identical install is what settles an install that finished but cannot be found. */
const INSTALL_ATTEMPTS = 2;

function run(command: string, args: string[]) {
  return runLauncher(command, args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER });
}

function ack(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  body: Record<string, unknown>,
): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
}

/**
 * GET_SESSION_MCP_INFO — installed and latest versions. `payload.refresh` re-resolves from disk first.
 *
 * An installed package that is behind the latest release is not left for the user to update: the
 * lookup that finds it starts the update, answers `updating: true`, and tells every screen when the
 * attempt is over so they ask again. `updatable` without `updating` therefore means an automatic
 * attempt already failed for this release, and the button is what is left.
 */
export async function getSessionMcpInfoHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if ((message.payload as { refresh?: boolean } | undefined)?.refresh) resetSessionMcpCache();
  const [installed, tags] = await Promise.all([getSessionMcpVersion(), fetchDistTags(SESSION_MCP_PACKAGE)]);
  const latest = tags.latest;
  const updatable = Boolean(installed && latest && isNewerVersion(latest, installed));
  const updating = updatable && latest
    ? autoUpdateSessionMcp(latest, () => connections.broadcastToAll(MessageType.SESSION_MCP_UPDATED, {}))
    : false;
  ack(connections, connectionId, message, {
    status: 'ok',
    packageName: SESSION_MCP_PACKAGE,
    installed,
    latest,
    updatable,
    updating,
  });
}

/**
 * INSTALL_SESSION_MCP — `npm i -g` (or the machine's own manager) for the package.
 *
 * Success is confirmed by finding the server's entry script afterwards, the thing the CLI will
 * be told to run, not by the install command's exit code.
 */
export async function installSessionMcpHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await waitForSessionMcpStartupUpdate();
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const coord = resolveInstallCoordinate(await resolveClaudePaths(), process.execPath, home);
  const { command, args } = buildInstallSpec(coord, process.execPath, SESSION_MCP_PACKAGE);
  console.log('session-mcp install\n', JSON.stringify({ coord, command, args, node: process.execPath }), '\n');

  for (let attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt++) {
    const result = await run(command, args);
    if (!result.ok) {
      const error = isPermissionFailure(result.output)
        ? permissionErrorMessage(command, args, result.output)
        : result.output || `${SESSION_MCP_PACKAGE} install failed`;
      ack(connections, connectionId, message, { status: 'error', error });
      return;
    }
    resetSessionMcpCache();
    if (await resolveSessionMcpEntry()) {
      ack(connections, connectionId, message, { status: 'ok' });
      return;
    }
  }
  ack(connections, connectionId, message, {
    status: 'error',
    error: `The ${SESSION_MCP_PACKAGE} installation did not complete. Please try again.`,
  });
}

/** UNINSTALL_SESSION_MCP — remove the package from every store that holds a copy, then re-check. */
export async function uninstallSessionMcpHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await waitForSessionMcpStartupUpdate();
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  const coord = resolveInstallCoordinate(await resolveClaudePaths(), process.execPath, home);
  const specs = buildUninstallSpecsForAllStores(coord, SESSION_MCP_PACKAGE, process.execPath);
  const attempts: Array<{ command: string; args: string[]; ok: boolean; output: string }> = [];
  for (const { command, args } of specs) {
    attempts.push({ command, args, ...(await run(command, args)) });
  }
  resetSessionMcpCache();
  const survivor = await getSessionMcpVersion();
  if (survivor) {
    const blocked = attempts.find((a) => !a.ok && isPermissionFailure(a.output));
    const error = blocked
      ? permissionErrorMessage(blocked.command, blocked.args, blocked.output)
      : `${SESSION_MCP_PACKAGE} ${survivor} is still installed after removing it from every store this backend knows.`;
    ack(connections, connectionId, message, { status: 'error', error });
    return;
  }
  ack(connections, connectionId, message, { status: 'ok' });
}
