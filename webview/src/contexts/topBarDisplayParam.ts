/**
 * The URL parameters that decide whether the top bar is drawn at all.
 *
 * `is_desktop=1` is how the Desktop app tells the page it is the embedded chat
 * view of that app. Written like a CLI option, so the host only has to load
 * `...?is_desktop=1`. The page decides what that changes; today it is the top
 * bar, which the Desktop shell draws itself. Only the draw is switched off: the
 * work the bar used to do on the page's behalf (title, favicon, alerts, activity
 * reports) belongs to the page and carries on.
 *
 * `top_bar_display=F` is the older spelling of the same switch. Desktop apps
 * that already shipped still open with it, so it keeps
 * working. The bar is hidden when either one asks for it.
 *
 * Absent or unrecognised means "shown", which is what every URL without the
 * parameters has always got — a typo must never take the bar away.
 */

export const IS_DESKTOP_PARAM_KEY = 'is_desktop';

/** The older spelling, kept so shipped Desktop apps still hide the bar. */
export const TOP_BAR_DISPLAY_PARAM_KEY = 'top_bar_display';

/** `is_desktop` values that mean "this is the Desktop app", compared after trimming and lower-casing. */
const DESKTOP_VALUES = new Set(['1', 'true', 't']);

/** `top_bar_display` values that hide the bar, compared after trimming and lower-casing. */
const HIDING_VALUES = new Set(['f', 'false', '0']);

function normalized(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  return raw === null ? null : raw.trim().toLowerCase();
}

/** Whether the top bar is drawn, parsed from a URL's search string. */
export function readTopBarDisplayFromUrl(search: string): boolean {
  const params = new URLSearchParams(search);
  const isDesktop = normalized(params, IS_DESKTOP_PARAM_KEY);
  const topBarDisplay = normalized(params, TOP_BAR_DISPLAY_PARAM_KEY);
  if (isDesktop !== null && DESKTOP_VALUES.has(isDesktop)) return false;
  if (topBarDisplay !== null && HIDING_VALUES.has(topBarDisplay)) return false;
  return true;
}
