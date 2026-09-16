import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getPendingWhatsNewVersion, markWhatsNewSeen } from '../features/whats-new';
import { MessageType } from '../../shared';

/**
 * 이번 실행에서 "What's new"를 띄워야 하는지 답한다.
 *
 * 판정은 백엔드가 시작할 때 이미 끝나 있다(`resolveWhatsNewOnStartup`). 여기서는 그 결과를
 * 돌려줄 뿐이라, 웹뷰 탭이 여럿 열려도 답이 갈리지 않는다.
 */
export async function getWhatsNewHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    version: getPendingWhatsNewVersion(),
  });
}

/**
 * 팝업을 띄웠다는 사실을 기록한다. 다음 실행부터는 설치 버전과 같아지므로 뜨지 않는다.
 *
 * 버전을 웹뷰가 실어 보내는 이유: 방금 화면에 떠 있던 바로 그 버전을 기록해야 하기 때문이다.
 * 백엔드가 자기 버전을 다시 읽어 쓰면 될 것 같지만, 그 둘은 항상 같다는 보장이 없다.
 */
export async function setWhatsNewSeenHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { version } = (message.payload ?? {}) as { version?: unknown };
  if (typeof version === 'string' && version.length > 0) {
    await markWhatsNewSeen(version);
  }
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    version: getPendingWhatsNewVersion(),
  });
}
