/**
 * Application-wide constants.
 *
 * Single source of truth for the app name.
 */
export const APP_NAME = 'Claude Code';

/**
 * Public privacy policy URL. Locale-agnostic — the site auto-redirects to the
 * visitor's locale (e.g. /privacy → /en/privacy). Registered on the JetBrains
 * Marketplace plugin page as well (required when collecting telemetry).
 */
export const PRIVACY_POLICY_URL = 'https://just-swttch.com/privacy';

/**
 * Public sponsorship (pricing) page. Locale-agnostic like the privacy URL — the
 * site redirects to the visitor's locale. The backend appends the install id and
 * account context as query params (see the GET_SPONSOR_URL handler) so the
 * checkout can prefill them and the payment can be mapped back to this install;
 * this bare constant is the fallback target when that context is unavailable.
 */
export const PRICING_URL = 'https://just-swttch.com/pricing';

/**
 * Where a feature doc lives, given its folder name under `docs/features/`.
 *
 * The docs are per-language files in the repo, so the link targets the folder
 * and lets the reader pick their language there — cheaper and more honest than
 * guessing which translations exist for a given feature.
 */
export function featureDocUrl(folder: string): string {
  return `https://github.com/Swttch/swttch/tree/main/docs/features/${folder}`;
}
