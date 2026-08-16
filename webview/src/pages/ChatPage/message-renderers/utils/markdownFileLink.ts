import { LINE_ANCHOR, resolveFilePath } from './tokenizeMessagePaths';
import { linkifyPlainTextFileRefs } from './plainTextFileRefs';

/**
 * A local file reference parsed out of an assistant markdown link href.
 * `path` has its `#L` anchor removed and is percent-decoded; `line` is the
 * 1-based line the caret should move to (undefined → open at the file top) and
 * `column` its 1-based column from a `#L10C5` anchor (undefined → column 1).
 */
export interface MarkdownFileLink {
  path: string;
  line?: number;
  column?: number;
}

/** True for a Windows drive-rooted path (`C:/…` or `C:\…`), matching `joinProjectPath`. */
function isWindowsAbsolute(href: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(href);
}

/**
 * Strip a `file://` URL down to the plain absolute path it names, or `null` if
 * the href is not a `file:` URL for THIS machine.
 *
 * A `file:` href cannot work as a link: rehype-sanitize drops the href as an
 * unsafe scheme and rehype-harden (both Streamdown's, neither ours to configure)
 * then swaps the whole `<a>` for a greyed "[blocked]" span — which is why the
 * tooltip reads "Blocked URL: undefined". Even rendered as a real anchor the
 * browser refuses to follow it ("Not allowed to load local resource"), so the
 * only path that actually opens the file is the local-file one below.
 *
 * Demoting the URL to a bare path here — BEFORE those plugins run — routes it
 * through exactly the handling a `/Users/…` link already gets, so it opens via
 * `openFile`. No new capability: that link could already do this.
 *
 * `file://host/share` (a remote UNC path) is deliberately NOT converted — only an
 * empty host or `localhost` names this machine. Percent-escapes are left for
 * {@link parseMarkdownFileLink} to decode, and Windows `file:///C:/…` yields
 * `/C:/…`, already the exact carry form that function expects.
 */
export function fileUrlToPath(href: string): string | null {
  const match = /^file:\/\/([^/]*)(\/.*)$/i.exec(href);
  if (!match) return null;
  const [, host, path] = match;
  if (host !== '' && host.toLowerCase() !== 'localhost') return null;
  return path;
}

/**
 * Parse a markdown link href into a local {@link MarkdownFileLink}, or `null`
 * for external hrefs (which keep normal link behavior).
 *
 * Local = POSIX-rooted (`/…`), Windows drive-rooted (`C:/…`, `C:\…`), or relative
 * (`./…`, `../…`). Protocol (`https:`, `mailto:`) and protocol-relative (`//host`)
 * URLs are external. The `#L` anchor and a leading `./` are stripped and the path
 * is percent-decoded to match the on-disk name.
 */
export function parseMarkdownFileLink(href: string): MarkdownFileLink | null {
  if (typeof href !== 'string' || href.length === 0) return null;

  // A `file://` href reaching here un-rewritten (e.g. a link built in code rather
  // than passed through the preprocessor) names the same local file.
  href = fileUrlToPath(href) ?? href;

  const isPosixAbsolute = href.startsWith('/') && !href.startsWith('//'); // exclude protocol-relative //host
  const isRelative = href.startsWith('./') || href.startsWith('../');
  if (!isPosixAbsolute && !isWindowsAbsolute(href) && !isRelative) return null;

  const match = LINE_ANCHOR.exec(href);
  const line = match ? Number(match[1]) : undefined;
  const column = match && match[2] ? Number(match[2]) : undefined;

  let path = href.replace(LINE_ANCHOR, '').replace(/^\.\//, '');
  // A Windows drive path travels as `/C:/…` (leading slash so rehype-sanitize
  // doesn't parse `C:` as a URL scheme and strip the link); restore `C:/…`.
  if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed percent-escape — keep the raw path rather than throw.
  }

  return { path, line, column };
}

/**
 * Render a resolved local path as a link href that survives rehype-sanitize.
 * Forward-slashes it (via {@link normalizeDotSegments}) and prefixes a Windows
 * drive path with `/` so `C:` is not parsed as a URL scheme (`C:/proj` →
 * `/C:/proj`); {@link parseMarkdownFileLink} strips that leading `/` back off.
 */
export function toLocalFileHref(path: string): string {
  const normalized = normalizeDotSegments(path);
  return /^[A-Za-z]:\//.test(normalized) ? `/${normalized}` : normalized;
}

/**
 * Collapse `.`/`..` segments in an already-resolved path (POSIX- or
 * Windows-drive-rooted, or relative) so the IDE file lookup gets a clean path,
 * e.g. `/wd/../foo.ts` → `/foo.ts`, `C:/wd/../foo.ts` → `C:/foo.ts`. Backslashes
 * are treated as separators; the result uses forward slashes. A leading `..` is
 * preserved only for relative paths (there is nothing above the root to pop).
 */
export function normalizeDotSegments(p: string): string {
  if (typeof p !== 'string' || p.length === 0) return p;

  const drive = /^([A-Za-z]:)[\\/]/.exec(p);
  let prefix = '';
  let rest = p;
  if (drive) {
    prefix = `${drive[1]}/`;
    rest = p.slice(drive[0].length);
  } else if (p.startsWith('/')) {
    prefix = '/';
    rest = p.slice(1);
  }

  const out: string[] = [];
  for (const segment of rest.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (prefix === '') out.push('..'); // keep leading `..` only for relative paths
    } else {
      out.push(segment);
    }
  }

  return prefix + out.join('/');
}

/**
 * Parse and fully resolve a markdown link href into a local file reference
 * ready for `openFile`, or `null` for external links. Relative paths are joined
 * against `workingDir` (absolute paths pass through) and `.`/`..` segments are
 * collapsed.
 */
export function resolveMarkdownFileLink(
  href: string,
  workingDir: string | null | undefined,
): MarkdownFileLink | null {
  const parsed = parseMarkdownFileLink(href);
  if (!parsed) return null;
  return {
    path: normalizeDotSegments(resolveFilePath(parsed.path, workingDir)),
    line: parsed.line,
    column: parsed.column,
  };
}

/**
 * Rewrite local-file link URLs in markdown to sanitize-safe absolute paths.
 *
 * rehype-harden resolves `./` relatives against the origin (losing the project
 * path) and rehype-sanitize drops a bare `C:` as a URL scheme — so resolve local
 * links to absolute here (relatives joined to `workingDir`) via {@link toLocalFileHref}
 * (Windows drive carried as `/C:/…`). External / `#` / code-span URLs are left
 * as-is; with no working dir, relatives fall back to the `./` form.
 */
export function normalizeMarkdownLinkUrls(markdown: string, workingDir: string | null | undefined): string {
  // Mask fenced blocks and inline code so link URLs inside code are never
  // rewritten (that would corrupt shown code and leak the working directory).
  const codeSpans: string[] = [];
  const masked = markdown.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*?`+/g,
    (span) => `\u0000${codeSpans.push(span) - 1}\u0000`,
  );

  // Match markdown links [text](url) but NOT image links ![text](url).
  const rewritten = masked.replace(
    /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g,
    (match, text: string, url: string) => {
      // `file://` names a path on this machine — unwrap it so the local-file
      // handling below carries it (see fileUrlToPath for why it cannot stay a URL).
      url = fileUrlToPath(url) ?? url;
      const isWindowsAbsolute = /^[A-Za-z]:[\\/]/.test(url);
      // A single-letter "scheme" followed by / or \ is a Windows drive, not a URL scheme.
      const isExternal = !isWindowsAbsolute
        && (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('//') || url.startsWith('#'));
      if (isExternal) return match;
      if (url.startsWith('/') || isWindowsAbsolute) return `[${text}](${toLocalFileHref(url)})`;
      if (workingDir) return `[${text}](${toLocalFileHref(resolveFilePath(url, workingDir))})`;
      return url.startsWith('./') || url.startsWith('../') ? match : `[${text}](./${url})`;
    },
  );

  return rewritten.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);
}

/**
 * Preprocess assistant markdown for the file-link renderer: first turn bare
 * plain-text source references (`src/app.ts:42`) into markdown links, then
 * resolve every local link URL to a sanitize-safe absolute path. The single
 * entry point used by the streaming message renderers so both the plain-text
 * and explicit-link paths always run together, in order.
 */
export function prepareAssistantMarkdown(markdown: string, workingDir: string | null | undefined): string {
  return normalizeMarkdownLinkUrls(linkifyPlainTextFileRefs(markdown), workingDir);
}
