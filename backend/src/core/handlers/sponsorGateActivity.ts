import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { SponsorGate, SponsorGateStep, SponsorGateSurface } from '../../shared';
import { sponsorGateEventName } from '../features/sponsorGateEvent';
import { rememberFollowedGate } from '../features/lastSponsorGate';
import { trackEvent } from '../features/telemetry';

const KNOWN_GATES = new Set<string>(Object.values(SponsorGate));
const KNOWN_STEPS = new Set<string>(Object.values(SponsorGateStep));
const KNOWN_SURFACES = new Set<string>(Object.values(SponsorGateSurface));

/**
 * SPONSOR_GATE_ACTIVITY — record that one feature offered sponsorship, or that
 * the offer was followed.
 *
 * Exists for the same reason ASSET_ACTIVITY does: showing the invitation and
 * following it both happen inside the webview and reach the backend no other
 * way, so without this the offer is invisible in usage data. It is the first
 * half of the payment funnel; the second half (the pricing page, the checkout,
 * the licence row) is joined back to it by the per-install id that travels on
 * the sponsor URL.
 *
 * An unrecognized gate or step is dropped rather than forwarded. These names are
 * read as measurements later, and a stale build or a hand-crafted socket message
 * must not be able to invent one. An unrecognized SURFACE is dropped on its own
 * without losing the event: the surface only refines a count that is already
 * meaningful, so a build that knows a surface this one does not should still be
 * counted rather than discarded.
 *
 * Properties carry enum values and counts only — never anything the user typed.
 */
export function sponsorGateActivityHandler(
  _connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const gate = message.payload?.gate;
  const step = message.payload?.step;
  if (typeof gate !== 'string' || !KNOWN_GATES.has(gate)) return;
  if (typeof step !== 'string' || !KNOWN_STEPS.has(step)) return;

  const from = message.payload?.from;
  const lockedCount = message.payload?.lockedCount;

  // Following a gate may open Settings in a different editor tab, so the tab
  // that eventually presses "sponsor" cannot be relied on to remember where the
  // user came from. Record it on this side, where there is only one of us.
  if (step === SponsorGateStep.Clicked) rememberFollowedGate(gate as SponsorGate);

  trackEvent(sponsorGateEventName(gate as SponsorGate, step as SponsorGateStep), {
    ...(typeof from === 'string' && KNOWN_SURFACES.has(from) ? { from } : {}),
    ...(typeof lockedCount === 'number' ? { lockedCount } : {}),
  });
}
