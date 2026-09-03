import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { setProjectFavorite } from '../features/projects-store';
import { MessageType } from '../../shared';

/**
 * 프로젝트 하나를 즐겨찾기에 넣거나 뺀다.
 *
 * 갱신된 전체 목록을 돌려주므로, 웹뷰는 자기 상태를 따로 추측하지 않고
 * 저장된 결과를 그대로 반영한다. 저장에 실패하면 status를 error로 돌려주어
 * 웹뷰가 낙관적으로 그린 별을 되돌릴 수 있게 한다. 저장되지 않은 고정을
 * 화면이 계속 주장하는 것이 이 응답이 막으려는 상태다.
 */
export async function setProjectFavoriteHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { path, favorite } = (message.payload ?? {}) as { path?: unknown; favorite?: unknown };
  const { ok, favoritePaths } = await setProjectFavorite(
    typeof path === 'string' ? path : '',
    favorite === true,
  );

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: ok ? 'ok' : 'error',
    favoritePaths,
  });
}
