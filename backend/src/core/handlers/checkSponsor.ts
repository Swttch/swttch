import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getSponsorStatus } from '../features/license';
import { claimSponsorByInstall } from '../features/license-claim';
import { MessageType } from '../../shared';

/**
 * Copy/paste-free activation. Asks www whether a sponsor key has been minted for
 * this install id (linked via the checkout the plugin opened) and stores it if
 * so. The Sponsor screen polls this right after checkout, so a completed payment
 * activates on its own.
 *
 * Unthrottled: the user is sitting in front of the screen waiting for a payment
 * to land, so every poll should really ask. The same pick-up also runs on its own
 * from `getSponsorStatus()` (throttled), which is what rescues a sponsor who
 * missed this window entirely — see license-claim.
 */
export async function checkSponsorHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await claimSponsorByInstall({ throttled: false });

  const sponsor = await getSponsorStatus();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    isSponsor: sponsor.isSponsor,
    licenseKey: sponsor.licenseKey,
    licenseStatus: sponsor.status,
  });
}
