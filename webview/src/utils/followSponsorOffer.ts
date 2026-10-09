import { Route } from '@/router';
import { SponsorGateStep, type SponsorGate, type SponsorGateSurface } from '@/shared';
import { openSettingsAt } from './openSettingsAt';
import { reportSponsorGate } from './reportSponsorGate';

/**
 * Follow a sponsor offer that a locked control carries: report that it was
 * followed, then open the Sponsor settings page the way the user prefers
 * settings to open (overlay or dedicated tab).
 *
 * The same two steps the Assets viewer's "Learn more" takes. The matching Seen
 * report is not made here: only the placement knows when its offer is really on
 * screen.
 */
export function followSponsorOffer(gate: SponsorGate, from: SponsorGateSurface): void {
  reportSponsorGate(gate, SponsorGateStep.Clicked, { from });
  void openSettingsAt(Route.SETTINGS_SPONSOR);
}
