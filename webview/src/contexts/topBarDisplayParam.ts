/**
 * The `top_bar_display` URL parameter: whether the top bar is drawn at all.
 *
 * Written like a CLI option, so a host that embeds the page can ask for a bare
 * chat by loading `...?top_bar_display=F`. Only the draw is switched off: the
 * work the bar used to do on the page's behalf (title, favicon, alerts, activity
 * reports) belongs to the page and carries on.
 *
 * Absent or unrecognised means "shown", which is what every URL without the
 * parameter has always got — a typo must never take the bar away.
 */

export const TOP_BAR_DISPLAY_PARAM_KEY = 'top_bar_display';

/** Values that hide the bar, compared after trimming and lower-casing. */
const HIDING_VALUES = new Set(['f', 'false', '0']);

/** Whether the top bar is drawn, parsed from a URL's search string. */
export function readTopBarDisplayFromUrl(search: string): boolean {
  const raw = new URLSearchParams(search).get(TOP_BAR_DISPLAY_PARAM_KEY);
  if (raw === null) return true;
  return !HIDING_VALUES.has(raw.trim().toLowerCase());
}
