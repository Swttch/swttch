import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { setProjectMeta } from '../features/projects-store';
import { MessageType } from '../../shared';

/**
 * Set or clear a project's display alias and/or description.
 *
 * Returns the full overlay, matching setProjectFavoriteHandler: the webview
 * reconciles its optimistic edit against whatever actually got stored rather
 * than trusting its own guess.
 */
export async function setProjectMetaHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { path, name, description } = (message.payload ?? {}) as {
    path?: unknown;
    name?: unknown;
    description?: unknown;
  };

  const { ok, projectMeta } = await setProjectMeta(typeof path === 'string' ? path : '', {
    name: typeof name === 'string' ? name : undefined,
    description: typeof description === 'string' ? description : undefined,
  });

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: ok ? 'ok' : 'error',
    projectMeta,
  });
}
