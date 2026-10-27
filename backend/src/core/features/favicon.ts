const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 200 * 1024;
const TIMEOUT_MS = 4000;

export interface SiteInfo {
  /** The icon as a data URL, or null when the site has none. */
  icon: string | null;
  /** The page's own `<title>`, when it has one. */
  title: string | null;
  /** True when the page's headers forbid showing it inside another page's frame. */
  blocksFraming: boolean;
}

/** Whether a response's headers keep the page out of a frame on another site (`frame-ancestors` wins over `X-Frame-Options`). */
export function blocksFraming(headers: { get(name: string): string | null }): boolean {
  const csp = headers.get('content-security-policy') ?? '';
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp)?.[1];
  if (ancestors !== undefined) return !/(^|\s)(\*|https?:)(\s|$)/i.test(ancestors);
  const options = (headers.get('x-frame-options') ?? '').toLowerCase();
  return options.includes('deny') || options.includes('sameorigin');
}

const cache = new Map<string, Promise<SiteInfo>>();

async function readLimited(response: Response, limit: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** The text of the page's `<title>`, with its entities for the few characters that matter undone. */
export function titleOf(html: string): string | null {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const text = raw?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : null;
}

/** The icon addresses a page names in `<link rel="icon">` tags, best first, resolved against the page. */
export function iconLinksOf(html: string, pageUrl: string): string[] {
  const found: Array<{ href: string; rank: number }> = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)["']?/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!value || !/\bicon\b/.test(rel)) continue;
    try {
      found.push({ href: new URL(value, pageUrl).toString(), rank: rel.includes('apple') ? 2 : rel.includes('shortcut') ? 0 : 1 });
    } catch {
      // A link that is not an address is not an icon.
    }
  }
  found.sort((a, b) => a.rank - b.rank);
  return found.map((f) => f.href);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Swttch)' } });
}

async function load(pageUrl: string): Promise<SiteInfo> {
  const candidates: string[] = [];
  let title: string | null = null;
  let blocked = false;
  try {
    const page = await fetchWithTimeout(pageUrl);
    blocked = blocksFraming(page.headers);
    const body = await readLimited(page, MAX_PAGE_BYTES);
    if (body && /html/i.test(page.headers.get('content-type') ?? '')) {
      const html = body.toString('utf8');
      candidates.push(...iconLinksOf(html, page.url || pageUrl));
      title = titleOf(html);
    }
  } catch {
    // The page may not answer here; its default icon is still tried.
  }
  candidates.push(new URL('/favicon.ico', pageUrl).toString());
  for (const href of candidates) {
    try {
      if (!/^https?:/i.test(href)) continue;
      const response = await fetchWithTimeout(href);
      if (!response.ok) continue;
      const bytes = await readLimited(response, MAX_ICON_BYTES);
      if (!bytes || bytes.length === 0) continue;
      let type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!type.startsWith('image/')) {
        if (!href.toLowerCase().endsWith('.ico')) continue;
        type = 'image/x-icon';
      }
      return { icon: `data:${type};base64,${bytes.toString('base64')}`, title, blocksFraming: blocked };
    } catch {
      // Try the next candidate.
    }
  }
  return { icon: null, title, blocksFraming: blocked };
}

/** The icon and name of a site's page as a data URL, or null when it has none. Remembered for the life of the backend. */
export function getSiteInfo(pageUrl: string): Promise<SiteInfo> {
  const none = Promise.resolve({ icon: null, title: null, blocksFraming: false });
  if (!/^https?:\/\//i.test(pageUrl)) return none;
  try {
    new URL(pageUrl);
  } catch {
    return none;
  }
  // The icon belongs to the site but the headers to the page, so a page is remembered by its own address.
  const key = pageUrl.split('#')[0];
  let known = cache.get(key);
  if (!known) {
    known = load(pageUrl);
    cache.set(key, known);
  }
  return known;
}
