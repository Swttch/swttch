import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getRunnerBestScore, setRunnerBestScore } from '../features/profile';
import { MessageType } from '../../shared';

/** 러너 게임(이스터에그) 최고 점수를 반환한다(기록이 없으면 0). */
export async function getRunnerBestScoreHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const best = await getRunnerBestScore();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    best,
  });
}

/**
 * 끝난 판의 점수를 기록한다. 기존 최고 기록보다 높을 때만 갱신되며,
 * 갱신 여부와 무관하게 현재 최고 기록을 돌려준다.
 */
export async function setRunnerBestScoreHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { score } = (message.payload ?? {}) as { score?: unknown };
  const best = await setRunnerBestScore(typeof score === 'number' ? score : 0);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    best,
  });
}
