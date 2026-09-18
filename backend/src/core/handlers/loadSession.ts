import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { markSessionAsSpawned } from '../claude-process';
import { MessageType } from '../../shared';
import { loadAndSendSession } from './loadAndSendSession';

export async function loadSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  const sessionId = message.payload?.sessionId as string;

  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'workingDir is required',
    });
    return;
  }

  if (sessionId) {
    // 기존 세션 로딩 → 다음 spawn 시 --resume 사용하도록 마킹
    markSessionAsSpawned(sessionId);
    connections.subscribe(connectionId, sessionId);
    
    const beforeUuid = message.payload?.beforeUuid as string | undefined;
    const limit = message.payload?.limit as number | undefined;
    // Set when the send index jumps to a send that is not loaded: the page has
    // to reach back far enough to include it. See loadSessionMessages.
    const includeUuid = message.payload?.includeUuid as string | undefined;
    const isOlderPage = message.type === MessageType.LOAD_OLDER_MESSAGES;

    await loadAndSendSession(connectionId, connections, workingDir, sessionId, {
      beforeUuid,
      limit,
      includeUuid,
      isOlderPage,
    });
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
