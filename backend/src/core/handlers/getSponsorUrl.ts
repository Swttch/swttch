import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { readProfile } from '../features/profile';
import { MessageType, SponsorGateStep } from '../../shared';
import { takeFollowedGate } from '../features/lastSponsorGate';
import { sponsorGateEventName } from '../features/sponsorGateEvent';
import { trackEvent } from '../features/telemetry';

// Public sponsorship (pricing) page. Mirrors the webview's PRICING_URL constant
// (config/app.ts) — kept here too because the backend, not the webview, stamps
// the install id onto the URL so that id never has to cross into the webview.
const SPONSOR_PRICING_URL = 'https://just-swttch.com/pricing';

/**
 * Build the sponsorship URL the webview opens in the external browser. The
 * per-install pseudonymous id (profile.uuid) is attached here as `uid` so the
 * checkout can map a completed payment back to this install via the webhook,
 * without the webview ever seeing the raw id. The account email/name (which the
 * webview already knows) are passed through as prefill hints when present.
 *
 * The gate the user followed to get here rides along as `src`, so a completed
 * payment can be credited to the feature that actually sold it. It travels on
 * the URL rather than only in telemetry because telemetry is opt-in: someone who
 * declined it still pays, and their purchase would otherwise arrive with no
 * origin at all. `src` is absent when nobody was sent by a gate — the user
 * opened Settings and decided on their own — and absent is the honest answer
 * there, since inventing an origin would credit a feature that did nothing.
 */
export async function getSponsorUrlHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const profile = await readProfile();

  const email = typeof message.payload?.email === 'string' ? message.payload.email : undefined;
  const name = typeof message.payload?.name === 'string' ? message.payload.name : undefined;
  const gate = takeFollowedGate();

  const params = new URLSearchParams();
  params.set('uid', profile.uuid);
  if (email !== undefined && email !== '') params.set('email', email);
  if (name !== undefined && name !== '') params.set('name', name);
  if (gate !== null) params.set('src', gate);

  const url = `${SPONSOR_PRICING_URL}?${params.toString()}`;

  // The last step the plugin can see. Measured here rather than in the webview
  // because this is where the URL is actually built and handed over, and because
  // the gate that explains it is only known on this side.
  if (gate !== null) trackEvent(sponsorGateEventName(gate, SponsorGateStep.Opened));

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    url,
  });
}
