import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readFileIcon } from '../features/fileIcon';

/**
 * Answer with the icon the system draws for a file extension, or with nothing when
 * it cannot be had, which leaves the chip on the icon it draws itself.
 */
export async function getFileIconHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const extension = message.payload?.extension;
  const icon = typeof extension === 'string' ? await readFileIcon(extension) : null;

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...(icon ?? {}),
  });
}
