/**
 * The event name a telemetry-consent decision is measured under.
 *
 * The action goes into the NAME rather than into properties, for the same reason
 * `assetEventName` does it: Rybbit reports unique users per event name but (as
 * far as we could measure) cannot filter users by a custom property. The accept
 * rate is a question about people — how many were asked, how many agreed — so
 * with the action sitting in properties the whole funnel would collapse into a
 * single "someone answered something" count and the rate would be uncomputable.
 *
 * `source` (banner / settings) deliberately stays in properties. Which surface
 * the user decided on is a secondary question, answerable by hits, and splitting
 * the name by it would force every accept count to be summed back together from
 * two separate names.
 */
export function consentEventName(action: string): string {
  return `telemetry_consent_${action}`;
}
