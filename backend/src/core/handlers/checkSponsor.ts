import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getSponsorStatus, clearDeactivation } from '../features/license';
import { claimSponsorByInstall } from '../features/license-claim';
import { MessageType } from '../../shared';

/**
 * Copy/paste-free activation. Asks www whether a sponsor key has been minted for
 * this install id and stores it if so, so a completed payment switches this
 * device on without the user copying a key back.
 *
 * This message only ever arrives because the user acted: they pressed "Sponsor"
 * (which opens checkout and arms the poll) or asked to switch this device back
 * on. That makes it the one place allowed to lift an earlier deactivation —
 * turning sponsorship off is a standing decision, and only an equally explicit
 * act may undo it. Background pick-up must never do this.
 *
 * Unthrottled for the same reason: the user is watching a payment land, so every
 * poll should really ask. The same pick-up also runs on its own from
 * `getSponsorStatus()` and at startup (throttled, and never lifting a
 * deactivation) — that is what rescues a sponsor who missed this window
 * entirely. See license-claim.
 */
export async function checkSponsorHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await clearDeactivation();
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
