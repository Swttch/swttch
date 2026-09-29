import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { disableSleepGuard, getSleepGuardStatus, persistSleepGuardIntent } from '../features/sleep-guard';
import { MessageType } from '../../shared';

export async function sleepGuardDisableHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    await disableSleepGuard();
    // The user's own click is the only thing that records a choice.
    await persistSleepGuardIntent(false);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
    });
    connections.broadcastToAll(MessageType.SLEEP_GUARD_STATUS, { ...getSleepGuardStatus() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
