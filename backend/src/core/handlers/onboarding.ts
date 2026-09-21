import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getOnboardingDismissed, setOnboardingDismissed } from '../features/profile';
import { MessageType } from '../../shared';

/**
 * 온보딩 체크리스트를 이미 닫았는지 답한다.
 *
 * 항목이 끝났는지는 여기서 답하지 않는다. 그건 기록이 아니라 지금 기계의 상태여서
 * 각자의 조회 경로(`GET_DETECTED_CLI_PATH`, `GET_ACCOUNT`, `GET_EXTEND_KIT_INFO`,
 * 설정 `dockLayout`)가 매번 새로 답해야 맞는 값이 나온다.
 */
export async function getOnboardingDismissedHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    dismissed: await getOnboardingDismissed(),
  });
}

/**
 * 닫았다는 사실을 기록한다.
 *
 * boolean이 아닌 값이 오면 쓰지 않고 현재 값을 그대로 돌려준다. 파일에 남는 사용자
 * 자산이므로, 뜻을 알 수 없는 입력으로 덮어쓰지 않는다.
 */
export async function setOnboardingDismissedHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { dismissed } = (message.payload ?? {}) as { dismissed?: unknown };
  const stored =
    typeof dismissed === 'boolean'
      ? await setOnboardingDismissed(dismissed)
      : await getOnboardingDismissed();

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    dismissed: stored,
  });
}
