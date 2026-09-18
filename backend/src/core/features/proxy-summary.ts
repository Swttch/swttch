/**
 * The proxy this backend will send an outbound request through, ready to show a user.
 *
 * Neither `process.env` nor settings.json answers this on its own. A proxy exported in a
 * shell is invisible to a settings reader, and a proxy written into settings.json is not an
 * environment variable at all — `claude` reads that file itself. The effective value is the
 * two laid over each other, which is what features/settings-env.ts returns and what every
 * caller here passes in.
 */
export interface ProxySummary {
  /** The variable that supplied it, e.g. `HTTPS_PROXY`. */
  variable: string;
  /** The proxy URL with any password replaced by `***`. */
  url: string;
}

/**
 * Hide the password in a proxy URL.
 *
 * Corporate proxy URLs routinely carry credentials (`http://user:pass@proxy:3128`),
 * and this string is headed for a chat panel that gets screenshotted into bug
 * reports. The username stays: it is what lets someone recognize which proxy this is.
 *
 * A URL we cannot parse is returned unchanged only when it contains no `@`; anything
 * with an authority we could not read is reported as its host-less form rather than
 * risking a leak.
 */
export function maskProxyUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    return url.toString().replace(/\/$/, '');
  } catch {
    if (!raw.includes('@')) return raw;
    // Unparseable but carries an authority: keep only what follows the credentials.
    return raw.slice(raw.lastIndexOf('@') + 1);
  }
}

/**
 * Which proxy variable is in effect, or null when the request goes out directly.
 *
 * Checks the HTTPS forms first because every Anthropic endpoint is https, then falls
 * back to the generic ones. Returns the FIRST that has a value, mirroring how an HTTP
 * client picks one, so the name shown is the name that matters.
 */
export function readProxySummary(env: NodeJS.ProcessEnv = process.env): ProxySummary | null {
  // Both cases in both families: most *nix tools read the upper-case form and some HTTP
  // clients prefer the lower-case one, and a user who wrote only one of them still has a
  // proxy worth naming.
  const ordered = [
    'HTTPS_PROXY', 'https_proxy',
    'ALL_PROXY', 'all_proxy',
    'HTTP_PROXY', 'http_proxy',
  ];

  for (const variable of ordered) {
    const value = env[variable];
    if (typeof value === 'string' && value.trim() !== '') {
      return { variable, url: maskProxyUrl(value.trim()) };
    }
  }
  return null;
}
