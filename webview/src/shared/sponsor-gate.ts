/**
 * Which paid feature asked the user to sponsor.
 *
 * The offer to sponsor is no longer made in one place. It is raised wherever a
 * paid feature is reached, and each of those places converts at its own rate —
 * an arrow that cannot move is a different ask from a toggle the user just
 * deliberately flipped. Measuring them as one number would average away the
 * only thing worth knowing: which feature actually sells.
 *
 * A gate is named after the FEATURE, not the widget. Auto-resume is offered from
 * a settings toggle, a command palette row, and the moment a usage limit is hit;
 * all three sell the same thing, so all three report `AutoResume`.
 */
export enum SponsorGate {
  /** Images beyond the first in a session, and the Assets screen. */
  Assets = 'assets',
  /** Sending a message at a scheduled time. */
  Schedule = 'schedule',
  /** Resuming automatically after a usage limit resets. */
  AutoResume = 'autoresume',
}

/**
 * How far the user got with one gate.
 *
 * These are the first steps of the payment funnel. The rest of it — the pricing
 * page, the checkout, the licence row — lives outside the plugin, and is joined
 * back to these by the per-install id that travels on the sponsor URL.
 */
export enum SponsorGateStep {
  /** The invitation was actually put in front of them. */
  Seen = 'seen',
  /** They followed it toward the sponsor page. */
  Clicked = 'clicked',
}

/**
 * The event name one gate step is measured under.
 *
 * Both the feature and the step go into the NAME rather than into properties,
 * because Rybbit reports unique users per event name but (as far as we could
 * measure) cannot filter users by a custom property. Every question this funnel
 * asks is about people — how many saw it, how many followed it — and counting
 * hits instead would let one person opening a viewer twenty times read like
 * twenty people.
 */
export function sponsorGateEventName(gate: SponsorGate, step: SponsorGateStep): string {
  return `gate_${gate}_${step}`;
}
