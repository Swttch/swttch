import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readFileBytesChunk } from '../features/fileBytes';

/** GET_FILE_BYTES: one piece of any file, for saving it. Anything that cannot be read answers a reason, never an error frame. */
export async function getFileBytesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const path = message.payload?.path;
  const offset = message.payload?.offset;
  const answer =
    typeof path === 'string' && path !== ''
      ? await readFileBytesChunk(path, typeof offset === 'number' && offset >= 0 ? offset : 0)
      : ({ ok: false, reason: 'unreadable' } as const);

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...answer });
}
