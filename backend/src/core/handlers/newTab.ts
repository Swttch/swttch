import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/** NEW_TAB: a tab of its own, whatever is open already. No path means a new conversation. */
export async function newTabHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    const workingDir = message.payload?.workingDir as string | undefined;
    const path = message.payload?.path as string | undefined;
    await bridge.newTab(workingDir, path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[node-backend]', `bridge.newTab() failed: ${msg}`);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
