import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * OPEN_TAB: the page at `path`, in the tab that is already showing it, or in a new one.
 *
 * A page is told apart by its address (`/sessions/<id>`, `/settings/sponsor`, ...), so
 * every way into a page (a session link, a settings jump, a sub-agent run) is this one
 * request rather than a message of its own.
 */
export async function openTabHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    const path = message.payload?.path as string | undefined;
    const workingDir = message.payload?.workingDir as string | undefined;
    if (path) {
      await bridge.openTab(path, workingDir);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[node-backend]', `bridge.openTab() failed: ${msg}`);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
