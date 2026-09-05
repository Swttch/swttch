import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { deactivateLicense } from '../features/license';
import { MessageType } from '../../shared';

/**
 * Turn sponsorship off on this install: the key goes, and the fact that the user
 * asked for it stays — automatic key pick-up reads that record and leaves them
 * alone (see deactivateLicense).
 */
export async function deactivateLicenseHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await deactivateLicense();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    isSponsor: false,
  });
}
