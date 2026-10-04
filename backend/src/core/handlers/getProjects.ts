import { homedir } from 'os';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { syncProjectsList } from '../features/syncProjectsList';
import { readFavoritePaths, readProjectMeta } from '../features/projectPreferences';
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
  // The picker scan covers the profile that holds every project, so a project the
  // CLI no longer has any record of is allowed to fall back to no sessions.
  //
  // A list that could not be read is reported as an error and not sent as an empty
  // one: "No projects" would look like every project was lost.
  let error: string | null = null;
  const projects = await syncProjectsList(true).catch((err) => {
    console.error('[node-backend]', 'Error reading projects list:', err);
    error = err instanceof Error ? err.message : String(err);
    return [];
  });

  // The home directory travels alongside the list, never folded into the
  // entries: `path` stays as the program recorded it, and the webview
  // shortens it to `~` for display only. The webview cannot work this out on
  // its own — in a tunnel session the browser runs on a different machine from
  // the backend, so its own home directory says nothing about these paths.
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? homedir();

  // Pinned paths ride along for the same reason: which projects the user pinned
  // is not a property of any one entry, and the picker needs both to sort.
  const favoritePaths = await readFavoritePaths().catch(() => []);

  // Aliases/descriptions travel the same way — a display-only overlay the
  // picker applies on top of each entry's real, unedited name.
  const projectMeta = await readProjectMeta().catch(() => []);

  connections.sendTo(connectionId, MessageType.PROJECTS_LIST, {
    projects,
    homeDir,
    favoritePaths,
    projectMeta,
    error,
  });
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
