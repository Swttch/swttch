import Bowser from 'bowser';

/**
 * Display formatting for the "IDE / Browser" line in About.
 *
 * The raw value behind this is the same one telemetry uses (`CCG_CLIENT_INFO` in
 * JetBrains mode, the browser user agent in standalone mode). Telemetry keeps
 * consuming that string verbatim; this module only decides how to *show* it.
 *
 * The two modes need opposite treatment:
 *
 * - JetBrains: Kotlin already composes `IntelliJ IDEA 2024.1.4 (IC-241.15989.149)`
 *   — product, version and build. That is precisely the granularity a bug report
 *   wants, so it is passed through untouched.
 * - Standalone: the value is a raw user agent, which is far too long to copy into
 *   a bug report. It gets reduced to product + version (`Chrome 149.0.7827.55`).
 */

/**
 * Reduce a browser user agent to `Name Version`.
 *
 * Uses `bowser` rather than hand-rolled matching because the naive reading of a
 * user agent is wrong in both directions: Edge's UA contains `Chrome`, and
 * Safari's does not contain `Chrome` at all.
 *
 * NOTE: only the browser name and version are taken. `bowser`'s `os` fields are
 * deliberately ignored — Apple freezes macOS at `10_15_7` in the user agent, so
 * they report a version the machine has not run for years (and `os.versionName`
 * confidently names the wrong release). The OS line comes from the backend
 * instead, which reads the real thing. See `os-info.ts`.
 *
 * Returns null when the agent cannot be identified, so the caller can decide
 * what to fall back to rather than showing a half-parsed name.
 */
export function formatBrowserFromUserAgent(userAgent: string): string | null {
  if (!userAgent || userAgent.trim().length === 0) return null;

  try {
    const { name, version } = Bowser.parse(userAgent).browser;
    if (!name) return null;
    return version ? `${name} ${version}` : name;
  } catch {
    // A user agent that bowser cannot parse must not take the About page down.
    return null;
  }
}

/**
 * Build the string shown on the "IDE / Browser" row.
 *
 * @param clientInfo the raw client identifier (IDE product string, or a user agent)
 * @param isJetBrains whether this backend was launched by the IDE
 *
 * Falls back to the raw value when it cannot be interpreted: showing a long user
 * agent is unhelpful, but showing nothing is worse, and it keeps the row honest
 * about what the backend actually knows.
 */
export function formatClientInfo(clientInfo: string, isJetBrains: boolean): string | null {
  const raw = clientInfo.trim();
  if (raw.length === 0) return null;

  // In JetBrains mode the value is the IDE product string, not a user agent —
  // it already carries the build and must not be run through a UA parser.
  if (isJetBrains) return raw;

  return formatBrowserFromUserAgent(raw) ?? raw;
}
