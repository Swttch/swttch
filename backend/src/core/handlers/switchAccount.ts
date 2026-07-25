import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { switchToAccount } from '../features/account-manager';
import { resetUsageCache } from './getUsage';
import { resetAllUsageCache } from './getAllUsage';
import { invalidateFableProbeCache } from '../features/fable-probe';

/**
 * SWITCH_ACCOUNT — make a saved account the live one (swap the CLI credential
 * slot). Broadcasts ACCOUNTS_CHANGED so every window refetches account + list.
 *
 * The swap is global (one credential slot for all projects/windows), like a
 * single login. New `claude` spawns pick up the new account; an in-flight stream
 * keeps its old credentials until it restarts.
 */
export async function switchAccountHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const id = (message.payload as { id?: string })?.id;
  if (!id) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing account id.',
    });
    return;
  }
  try {
    const account = await switchToAccount(id);
    resetUsageCache();
    resetAllUsageCache();
    invalidateFableProbeCache(); // Fable availability is per-account — drop the stale verdict.
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      account,
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
