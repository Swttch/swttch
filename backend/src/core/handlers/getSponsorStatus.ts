import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getSponsorStatus } from '../features/license';
import { MessageType } from '../../shared';

/** Report the current sponsor entitlement (derived from the locally stored key). */
export async function getSponsorStatusHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sponsor = await getSponsorStatus();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    isSponsor: sponsor.isSponsor,
    licenseKey: sponsor.licenseKey,
    licenseStatus: sponsor.status,
    // Plan details, so the sponsor screen can say what they are on.
    tier: sponsor.tier,
    interval: sponsor.interval,
  });
}
