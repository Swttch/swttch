/**
 * What a card for a web page shows of it: the title, the site and a picture.
 *
 * Claude Desktop draws a card for a page Claude opens in its browser panel, with
 * the panel's own screenshot of it. The CLI we run has no browser panel and no
 * screenshot, so the picture is the one the page offers for exactly this purpose
 * (`og:image`, the preview image sites publish for link cards), read here so the
 * chat never contacts the page's server itself.
 */
export interface LinkPreview {
  url: string;
  /** The site, `github.com` for a page on it. */
  host: string;
  title?: string;
  /** The page's preview image as a `data:` URL, when it has one of a size worth carrying. */
  image?: string;
}

const PAGE_TIMEOUT_MS = 6000;
const PAGE_MAX_BYTES = 512 * 1024;
const IMAGE_TIMEOUT_MS = 6000;
const IMAGE_MAX_BYTES = 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; Swttch link preview)';

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

/** The `content` of the `<meta>` tag naming `property` (or `name`), or undefined. */
export function metaContent(html: string, property: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (key !== property) continue;
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (value !== undefined && value.trim() !== '') return decodeEntities(value.trim());
  }
  return undefined;
}

/** The page's title: its `og:title`, else its `<title>`. */
export function titleOf(html: string): string | undefined {
  const og = metaContent(html, 'og:title');
  if (og) return og;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const cleaned = title ? decodeEntities(title.replace(/\s+/g, ' ').trim()) : '';
  return cleaned === '' ? undefined : cleaned;
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}

async function fetchWithin(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.8,*/*;q=0.5' },
  });
}

/**
 * The card for `url`: whatever of the title and picture could be read. A page
 * that cannot be reached, is not HTML or is too large simply has fewer parts.
 * Only http and https pages are read.
 */
export async function readLinkPreview(url: string): Promise<LinkPreview> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, host: '' };
  }
  const card: LinkPreview = { url, host: parsed.host.replace(/^www\./, '') };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return card;

  let html: string;
  try {
    const response = await fetchWithin(url, PAGE_TIMEOUT_MS);
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('html')) return card;
    const bytes = await readBounded(response, PAGE_MAX_BYTES);
    if (!bytes) return card;
    html = new TextDecoder().decode(bytes);
  } catch {
    return card;
  }

  const title = titleOf(html);
  if (title) card.title = title;

  const imageRef = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
  if (!imageRef) return card;
  try {
    const imageUrl = new URL(imageRef, parsed);
    if (imageUrl.protocol !== 'http:' && imageUrl.protocol !== 'https:') return card;
    const response = await fetchWithin(imageUrl.toString(), IMAGE_TIMEOUT_MS);
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !/^image\/(png|jpe?g|gif|webp|avif)$/.test(type)) return card;
    const bytes = await readBounded(response, IMAGE_MAX_BYTES);
    if (bytes) card.image = `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    // The card keeps its title without a picture.
  }
  return card;
}
