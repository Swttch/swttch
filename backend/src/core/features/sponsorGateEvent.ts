import type { SponsorGate, SponsorGateStep } from '../../shared';

/**
 * The event name one step of one feature's sponsor gate is measured under.
 *
 * Both the feature and the step go into the NAME rather than into properties,
 * for the same reason `consentEventName` and `assetEventName` do it: Rybbit
 * reports unique users per event name but (as far as we could measure) cannot
 * filter users by a custom property. Every question this funnel asks is about
 * people — how many were shown the offer, how many followed it — so with the
 * feature sitting in properties the whole thing would collapse into a single
 * "someone was offered something" count and no per-feature rate could be
 * computed at all.
 *
 * Which SURFACE raised the offer (a settings toggle, a command palette row, the
 * moment a limit was hit) deliberately stays in properties. That is a secondary
 * question, answerable by hits, and splitting the name by it would force every
 * feature's count to be summed back together from several names — exactly what
 * `consentEventName` avoids by keeping `source` out of the name.
 */
export function sponsorGateEventName(gate: SponsorGate, step: SponsorGateStep): string {
  return `gate_${gate}_${step}`;
}
