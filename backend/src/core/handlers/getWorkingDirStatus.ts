import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { isFolderGone } from '../project-folder';

/**
 * Answers whether the folder a session works in is still on disk, so a screen can say
 * so when the session is opened rather than when the first message fails to send.
 * The question is put to the same `isFolderGone` that sending a message asks, so the
 * two can never disagree about a folder.
 */
export async function getWorkingDirStatusHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir =
    typeof message.payload?.['workingDir'] === 'string' ? (message.payload['workingDir'] as string) : '';

  // Without a folder there is nothing to be gone; the project list is where such a client is.
  const gone = workingDir.length > 0 && (await isFolderGone(workingDir));

  connections.sendTo(connectionId, MessageType.WORKING_DIR_STATUS, { workingDir, gone });
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
