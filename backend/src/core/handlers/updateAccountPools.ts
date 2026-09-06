import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, type AccountPool } from '../../shared';
import { updateAccountPools } from '../features/account-manager';

export async function updateAccountPoolsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const accountPools = (message.payload as { accountPools?: AccountPool[] } | undefined)?.accountPools;
  if (!Array.isArray(accountPools)) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing account pools.',
    });
    return;
  }

  try {
    const saved = await updateAccountPools(accountPools);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      accountPools: saved,
    });
    connections.broadcastToAll(MessageType.ACCOUNTS_CHANGED, {});
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
