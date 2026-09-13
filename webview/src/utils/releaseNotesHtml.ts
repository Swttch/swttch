/**
 * Marketplace release-note HTML: sanitizing, title extraction and date
 * formatting.
 *
 * Two screens render the same marketplace changelog — the Releases settings
 * accordion and the "what's new" modal that opens after an update — so the
 * parsing lives here rather than inside either of them.
 */

/**
 * Sanitize HTML by stripping all tags except a safe allowlist.
 * This prevents XSS from untrusted release notes.
 *
 * Strategy: bottom-up walk so that when a disallowed parent is unwrapped,
 * its children have already been sanitized.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote',
  'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'dl', 'dt', 'dd', 'sup', 'sub', 'del', 'ins',
  'img',
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['title', 'class', 'id', 'style']),
  'a': new Set(['href']),
  'img': new Set(['src', 'alt', 'width', 'height']),
};

function isAllowedAttr(tag: string, attrName: string): boolean {
  return (ALLOWED_ATTRS['*']?.has(attrName) ?? false)
    || (ALLOWED_ATTRS[tag]?.has(attrName) ?? false);
}

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('#') || value.startsWith('/');
}

/**
 * Fallback when DOMParser is unavailable/failing (some JCEF builds) or produces
 * no <body>. The old fallback stripped every tag, which collapsed the whole
 * changelog into one run-on paragraph (the `\n`s between tags render as spaces
 * in HTML). Here we first turn block boundaries into newlines and list items
 * into bullets, strip the remaining tags, escape the text, then re-emit the
 * newlines as <br> — so the release notes keep their line structure even
 * without a working DOM parser.
 */
export function stripToTextWithBreaks(html: string): string {
  const withBreaks = html
    .replace(/<li[^>]*>/gi, '• ') // list marker at item start
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|blockquote|pre)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const temp = document.createElement('div');
  temp.textContent = withBreaks; // escape any stray < > &
  return temp.innerHTML.replace(/\n/g, '<br>');
}

export function sanitizeReleaseHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc?.body) return stripToTextWithBreaks(html);
    // Walk the body's children, not the body itself: `body` is not in
    // ALLOWED_TAGS, so handing it to walkBottomUp makes the walk unwrap and
    // remove the body — after which `doc.body` is null and reading innerHTML
    // throws, sending every release note down the plain-text fallback.
    for (const child of Array.from(doc.body.childNodes)) {
      walkBottomUp(child);
    }
    return doc.body.innerHTML;
  } catch {
    return stripToTextWithBreaks(html);
  }
}

function walkBottomUp(node: Node): void {
  // Recurse children first (bottom-up), snapshot to handle mutations
  const children = Array.from(node.childNodes);
  for (const child of children) {
    walkBottomUp(child);
  }

  // Now process the current node itself
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: move (already-sanitized) children before this node, then remove it
    while (el.firstChild) {
      el.parentNode?.insertBefore(el.firstChild, el);
    }
    el.parentNode?.removeChild(el);
    return;
  }

  // Remove disallowed attributes
  for (const attr of Array.from(el.attributes)) {
    if (!isAllowedAttr(tag, attr.name.toLowerCase())) {
      el.removeAttribute(attr.name);
    }
  }

  // Sanitize URL attributes
  for (const urlAttr of ['href', 'src']) {
    if (el.hasAttribute(urlAttr)) {
      const val = el.getAttribute(urlAttr) ?? '';
      if (!isSafeUrl(val)) {
        el.removeAttribute(urlAttr);
      }
    }
  }
}

/**
 * `cdate` with the local timezone appended. `fallback` is returned verbatim for
 * an unparseable timestamp — the caller passes its own translated string
 * because the two screens that render release notes live in different i18n
 * namespaces.
 */
export function formatReleaseDate(cdate: string | number, fallback: string): string {
  const ms = typeof cdate === 'string' ? parseInt(cdate, 10) : cdate;
  if (isNaN(ms)) return fallback;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const tz = Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts().find(p => p.type === 'timeZoneName')?.value ?? '';
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} (${tz})`;
}

/** `cdate` as a bare `YYYY-MM-DD`, for headers that have no room for a clock. */
export function formatReleaseDateShort(cdate: string | number, fallback: string): string {
  const ms = typeof cdate === 'string' ? parseInt(cdate, 10) : cdate;
  if (isNaN(ms)) return fallback;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The leading `<h1>`–`<h3>` of a release note, as plain text. */
export function extractTitle(notes: string): string | null {
  const match = notes.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
  if (!match) return null;
  try {
    // Strip any HTML tags from the title text to prevent XSS
    const temp = document.createElement('div');
    temp.innerHTML = match[1];
    return temp.textContent ?? null;
  } catch {
    // Fallback: strip tags with regex
    return match[1].replace(/<[^>]*>/g, '') || null;
  }
}

/** The release note with its leading heading removed (it is rendered separately). */
export function stripTitle(notes: string): string {
  return notes.replace(/<h[1-3][^>]*>.*?<\/h[1-3]>/i, '').trim();
}

/** Heading levels that start a release section in the marketplace changelog. */
export const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

/**
 * The body of the newest section only, as HTML.
 *
 * A marketplace `notes` field carries SEVERAL releases concatenated, newest
 * first — see `pages/ChatPage/parseReleaseNotes.ts` for the shape. `stripTitle`
 * removes just the leading heading, so anything rendering its result shows the
 * tail of older releases too; a pager that puts one release per page needs the
 * section boundary honored instead.
 *
 * Unlike `parseLatestReleaseNotes`, which reduces the section to plain strings
 * for the banner, this keeps the markup so lists, links and code spans survive.
 * The caller still runs it through `sanitizeReleaseHtml`.
 */
export function takeFirstSection(notes: string): string {
  try {
    const doc = new DOMParser().parseFromString(notes, 'text/html');
    if (!doc?.body) return stripTitle(notes);
    const blocks = Array.from(doc.body.children);

    const headingIndex = blocks.findIndex((el) => HEADING_TAGS.has(el.tagName));
    // No heading at all means the note is not sectioned: it is one release.
    if (headingIndex === -1) return notes;

    const out: string[] = [];
    for (let i = headingIndex + 1; i < blocks.length; i++) {
      if (HEADING_TAGS.has(blocks[i].tagName)) break; // the previous release starts here
      out.push(blocks[i].outerHTML);
    }
    return out.join('');
  } catch {
    return stripTitle(notes);
  }
}

/**
 * A section heading without its `"<version> - "` prefix, for screens that
 * already show the version next to the title.
 */
export function stripVersionPrefix(title: string, version: string | null | undefined): string {
  if (!version) return title;
  const prefix = `${version} - `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}
