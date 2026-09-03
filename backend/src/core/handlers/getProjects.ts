import { homedir } from 'os';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getProjectsList } from '../features/getProjectsList';
import { readFavoritePaths } from '../features/projects-store';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

export async function getProjectsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  // The project picker has no active project, so resolve the GLOBAL CLAUDE_CONFIG_DIR
  // onto process.env. Otherwise a project-scoped override left in process.env would
  // make the list read from the wrong profile's projects dir (showing "No projects"). (#123)
  await Claude.applyConfigDir();
  const projects = await getProjectsList();

  // The home directory travels alongside the list, never folded into the
  // entries: `path` stays exactly as the CLI recorded it, and the webview
  // shortens it to `~` for display only. The webview cannot work this out on
  // its own — in a tunnel session the browser runs on a different machine from
  // the backend, so its own home directory says nothing about these paths.
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? homedir();

  // Pinned paths ride along for the same reason: which projects the user pinned
  // is not a property of any one entry, and the picker needs both to sort.
  const favoritePaths = await readFavoritePaths();

  connections.sendTo(connectionId, MessageType.PROJECTS_LIST, {
    projects,
    homeDir,
    favoritePaths,
  });
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
