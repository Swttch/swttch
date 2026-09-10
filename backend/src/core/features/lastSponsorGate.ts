import type { SponsorGate } from '../../shared';

/**
 * The gate a user most recently followed toward the sponsor page.
 *
 * Why the backend holds this rather than the webview: following a gate opens
 * Settings, and the user's "Open Settings as" preference may open it as a new
 * EDITOR TAB — a separate JCEF browser with its own memory. The tab that raised
 * the offer and the tab that presses "sponsor" can therefore be different
 * programs, so nothing carried in webview state survives the trip. The backend
 * is single, and the click already arrives here as SPONSOR_GATE_ACTIVITY, so
 * remembering it here costs no new signal at all.
 *
 * Only the latest is kept. This answers "what were they looking at when they
 * decided", and a user who passes two gates before paying decided at the second
 * one.
 */
interface FollowedGate {
  gate: SponsorGate;
  at: number;
}

let followed: FollowedGate | null = null;

/**
 * How long a followed gate still explains a payment.
 *
 * Without an expiry, a gate followed weeks ago would be credited for a purchase
 * someone made today from the Settings page on their own — attributing a sale to
 * a feature that had nothing to do with it. Half an hour is far longer than the
 * walk from a gate to the checkout button and far shorter than "some other day".
 */
const ATTRIBUTION_WINDOW_MS = 30 * 60 * 1000;

/** Remember that this gate was followed toward the sponsor page. */
export function rememberFollowedGate(gate: SponsorGate, now: number = Date.now()): void {
  followed = { gate, at: now };
}

/**
 * The gate that still explains a sponsor-page visit, or null.
 *
 * Null is a real answer, not a failure: someone who opened Settings and decided
 * on their own was not sent by any feature, and guessing one would invent a
 * conversion that never happened.
 */
export function takeFollowedGate(now: number = Date.now()): SponsorGate | null {
  if (followed === null) return null;
  if (now - followed.at > ATTRIBUTION_WINDOW_MS) {
    followed = null;
    return null;
  }
  return followed.gate;
}

/** Test seam — forget any followed gate between cases. */
export function __resetFollowedGate(): void {
  followed = null;
}
