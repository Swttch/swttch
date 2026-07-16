import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { markSessionAsSpawned } from '../claude-process';
import { Claude } from '../claude';
import { MessageType } from '../../shared';
import { loadAndSendSession } from './loadAndSendSession';

export async function reclaimSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string;
  const workingDir = message.payload?.workingDir as string | undefined;
  const limit = message.payload?.limit as number | undefined;

  if (!sessionId) {
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
    return;
  }

  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'workingDir is required',
    });
    return;
  }

  console.error('[node-backend]', `Reclaiming session: ${sessionId}`);

  // 1. 내부 프로세스 종료
  const session = connections.getSession(sessionId);
  if (session?.process) {
    console.error('[node-backend]', `Killing internal process for session ${sessionId}`);
    Claude.killTree(session.process);
    connections.setProcess(sessionId, null);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 2. 다음 spawn 시 --resume 사용하도록 마킹
  markSessionAsSpawned(sessionId);

  // 3. 세션 메시지 로딩 & 전송
  // Forward the pagination limit so a reclaim honors the user's "Paginate chat
  // history" setting exactly like the initial load (loadSessionHandler).
  connections.subscribe(connectionId, sessionId);
  await loadAndSendSession(connectionId, connections, workingDir, sessionId, { limit });

  console.error('[node-backend]', `Session ${sessionId} reclaimed successfully`);
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
