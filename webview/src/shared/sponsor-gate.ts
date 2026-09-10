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
  /**
   * The pricing page was opened in the external browser for them.
   *
   * Reported by the BACKEND, which is the only side that knows the sponsor URL
   * was actually built and handed over. It is also the last step the plugin can
   * see at all: everything after it happens on the website and in the checkout,
   * and is joined back to this by the per-install id riding on that URL.
   */
  Opened = 'opened',
}

/**
 * Where the offer was raised from.
 *
 * Unlike the gate itself this rides in PROPERTIES, not in the event name. Which
 * surface raised the offer is a secondary question, answerable by hits, and
 * splitting the name by it would force every feature's headcount to be summed
 * back together from several names — the same trade `consentEventName` makes
 * with its `source`.
 *
 * It still has to be recorded, because one feature's surfaces are not
 * interchangeable: someone who deliberately flipped the auto-resume toggle in
 * Settings asked for it, while someone who merely hit a usage limit did not.
 */
export enum SponsorGateSurface {
  /** The image viewer — its edge arrow, or the notice under the thumbnail. */
  Viewer = 'viewer',
  /** The Assets screen header. */
  AssetsScreen = 'assets_screen',
  /** The schedule-send popover. */
  SchedulePopover = 'schedule_popover',
  /** A backend request refused because the user isn't a sponsor. */
  BackendRefusal = 'backend_refusal',
  /** The auto-resume toggle in Settings. */
  SettingsToggle = 'settings_toggle',
  /** The auto-resume row in the command palette. */
  CommandPalette = 'command_palette',
  /** Auto-resume declining to run at the moment a usage limit was hit. */
  UsageLimit = 'usage_limit',
}
