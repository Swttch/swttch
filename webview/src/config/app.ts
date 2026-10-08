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
 * The source repository.
 *
 * `yhk1038/claude-code-gui-jetbrains` is the former name. GitHub still
 * redirects it, so a stale link looks like it works and survives review —
 * which is exactly why every link is built from this one constant.
 */
export const REPO_URL = 'https://github.com/Swttch/swttch';

export const ISSUES_URL = `${REPO_URL}/issues`;

/**
 * Where a feature doc lives, given its folder name under `docs/features/`.
 *
 * The docs are per-language files in the repo, and the English one is the file
 * every feature has, so the link opens it directly. A link to the folder showed
 * a file listing instead of the doc, one more click before any text.
 */
export function featureDocUrl(folder: string): string {
  return `${REPO_URL}/blob/main/docs/features/${folder}/en.md`;
}
