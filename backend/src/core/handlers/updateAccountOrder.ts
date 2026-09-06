import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { updateAccountOrder } from '../features/account-manager';

/**
 * Persist the order the user arranged saved accounts in.
 *
 * Separate from UPDATE_ACCOUNT_POOLS because it is a different action: pools say
 * which accounts take over for each other, order says how the list reads. The
 * settings screen can change either one without touching the other.
 */
export async function updateAccountOrderHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const accountOrder = (message.payload as { accountOrder?: string[] } | undefined)?.accountOrder;
  if (!Array.isArray(accountOrder)) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing account order.',
    });
    return;
  }

  try {
    const saved = await updateAccountOrder(accountOrder);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      accountOrder: saved,
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
