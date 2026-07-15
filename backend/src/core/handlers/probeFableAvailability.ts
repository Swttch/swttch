import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getFableAvailability } from '../features/fable-probe';

/**
 * PROBE_FABLE_AVAILABILITY — report whether the current account can still select
 * Fable, via a real (cached) `--model fable` call.
 *
 * The webview triggers this only after `FABLE_PROMO_END` when the account's
 * catalog omits Fable, to decide whether to keep offering it in the picker. The
 * probe is cached (TTL) in `getFableAvailability`, so repeated picker opens
 * within the window don't re-spend on the paid Fable call.
 */
export async function probeFableAvailabilityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as { workingDir?: string; force?: boolean } | undefined;
    const result = await getFableAvailability({
      workingDir: payload?.workingDir,
      force: payload?.force,
    });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      available: result.available,
      checkedAt: result.checkedAt,
      fromCache: result.fromCache,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
