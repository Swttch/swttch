import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { findBackgroundTaskOutputPath } from './findBackgroundTaskOutputPath';
import { MessageType } from '../../shared';

export async function findBackgroundTaskOutputPathHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const taskId = message.payload?.taskId as string | undefined;
  const workingDir = message.payload?.workingDir as string | undefined;
  // The session that started the task; lets a task gone from the runtime directory be found beside its session.
  const sessionId = message.payload?.sessionId as string | undefined;

  const result = await findBackgroundTaskOutputPath({
    taskId: taskId ?? '',
    workingDir: workingDir ?? '',
    sessionId,
  });

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...result,
  });
}
