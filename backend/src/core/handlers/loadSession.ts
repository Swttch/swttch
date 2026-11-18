import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { markSessionAsSpawned } from '../claude-process';
import { MessageType } from '../../shared';
import { loadAndSendSession } from './loadAndSendSession';
import { followSessionTranscript } from '../features/sessionTranscriptFollower';

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
    // The page after this entry (LOAD_NEWER_MESSAGES), or the page centred on this
    // one (LOAD_MESSAGES_AROUND). See loadSessionMessages for the cursor rules.
    const afterUuid = message.payload?.afterUuid as string | undefined;
    const aroundUuid = message.payload?.aroundUuid as string | undefined;
    // The entry the client holds on the far side of the page, where it should stop.
    const untilUuid = message.payload?.untilUuid as string | undefined;
    const isOlderPage = message.type === MessageType.LOAD_OLDER_MESSAGES;
    const isNewerPage = message.type === MessageType.LOAD_NEWER_MESSAGES;
    const isAroundPage = message.type === MessageType.LOAD_MESSAGES_AROUND;

    await loadAndSendSession(connectionId, connections, workingDir, sessionId, {
      beforeUuid,
      limit,
      afterUuid,
      aroundUuid,
      untilUuid,
      isOlderPage,
      isNewerPage,
      isAroundPage,
    });
    // Opening a session (not a page of one already open): when a program this backend does not run works on it,
    // its screen is told as the transcript grows.
    if (!isOlderPage && !isNewerPage && !isAroundPage) {
      void followSessionTranscript(connectionId, sessionId, workingDir, connections);
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
