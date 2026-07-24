import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { detectInstalledEditors } from '../features/detectEditors';
import { MessageType } from '../../shared';

export async function getAvailableEditorsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const result = await detectInstalledEditors();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    editors: result,
  });
}
