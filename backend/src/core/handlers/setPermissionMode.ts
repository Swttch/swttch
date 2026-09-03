import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendSetPermissionModeToProcess } from '../claude-process';
import { MessageType } from '../../shared';

/**
 * Carry a permission mode the user picked to the CLI that is running right now.
 *
 * Answered with `ok` whether or not the CLI took it. A session with no live CLI
 * is the ordinary case (the user changes the mode between turns), and the mode
 * still reaches the next spawn as `--permission-mode` — so reporting an error
 * here would call the normal path a failure. `applied` says which of the two
 * happened, for callers that care.
 */
export function setPermissionModeHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const client = connections.getClient(connectionId);
  const inputMode = message.payload?.inputMode as string | undefined;

  if (!client?.subscribedSessionId || !inputMode) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: !inputMode ? 'No inputMode given' : 'No active session',
    });
    return;
  }

  const sessionId = client.subscribedSessionId;
  const applied = sendSetPermissionModeToProcess(connections, sessionId, inputMode);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    applied,
  });
}
