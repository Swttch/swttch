import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ensureClaudeProcess } from '../claude-process';
import { MessageType } from '../../shared';

export async function startSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  const sessionId = message.payload?.sessionId as string | undefined;

  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'workingDir is required',
    });
    return;
  }
  // Absent means the webview has no mode to ask for yet — the CLI then reads its
  // own `permissions.defaultMode` instead of being handed a substitute here.
  const inputMode = message.payload?.inputMode as string | undefined;

  try {
    if (sessionId) {
      connections.subscribe(connectionId, sessionId);
      await ensureClaudeProcess(connections, connectionId, workingDir, sessionId, inputMode, bridge);
    }
  } catch (err) {
    // ensureClaudeProcess already broadcasts SERVICE_ERROR to the session.
    console.error('[node-backend]', 'startSession failed:', err);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
