import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } from '../features/backgroundTaskOutputWatcher';

/**
 * WATCH_BACKGROUND_TASK_OUTPUT — subscribe this connection to a background
 * Bash task's output log; the backend pushes BACKGROUND_TASK_OUTPUT_CHANGED
 * on every file change (issue #347 follow-up, replacing client-side polling).
 */
export function watchBackgroundTaskOutputHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const outputFile = (message.payload as { outputFile?: string } | undefined)?.outputFile;
  if (!outputFile) return;
  watchBackgroundTaskOutput(connectionId, outputFile, connections);
}

/** UNWATCH_BACKGROUND_TASK_OUTPUT — stop pushing updates for this file to this connection. */
export function unwatchBackgroundTaskOutputHandler(
  connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const outputFile = (message.payload as { outputFile?: string } | undefined)?.outputFile;
  if (!outputFile) return;
  unwatchBackgroundTaskOutput(connectionId, outputFile);
}
