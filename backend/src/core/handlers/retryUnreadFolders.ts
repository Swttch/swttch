import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { unreadFolderRetry } from '../features/unread-folder-retry';
import { MessageType } from '../../shared';

/**
 * Read again every old folder that could not be read, because the user may just have
 * allowed access to it. Answers once the pass is over; what it moved reaches the
 * window through the migration status.
 */
export async function retryUnreadFoldersHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await unreadFolderRetry.retryAll();
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
