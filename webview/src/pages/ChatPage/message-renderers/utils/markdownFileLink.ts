import { resolveFilePath } from './tokenizeMessagePaths';
import { COLON_POSITION, LINE_ANCHOR } from './fileLocator';
import { REFERENCE_DEFINITION, replaceMarkdownLinks, type MarkdownLinkSpan } from './markdownLinkSpans';
import { linkifyPlainTextFileRefs } from './plainTextFileRefs';

/**
 * A local file reference parsed out of an assistant markdown link href.
 * `path` has its line position removed and is percent-decoded; `line` is the
 * 1-based line the caret should move to (undefined → open at the file top) and
 * `column` its 1-based column (undefined → column 1). A `#heading` stays on the
 * path: only the disk tells it from a `#` in a file name, so the backend does.
 */
export interface MarkdownFileLink {
  path: string;
  line?: number;
  column?: number;
}

/**
 * A `:line`, `:line:col` or `:start-end` tail on a file name that has an extension
 * (`a.py:9`, `a.ts:42:7`). Group 1 is the line, group 2 the column. The extension is
 * required so an extensionless name ending in digits (`/var/log/app:5`) keeps its
 * whole name here; the backend takes the tail off when no such file exists.
 */
const COLON_LOCATOR = new RegExp(String.raw`(?<=\.[A-Za-z][A-Za-z0-9]*)${COLON_POSITION}$`);

/** A bare `name.ext:line[:col]` or `dir/name.ext:line[:col]` link target (no URL scheme before the first colon). */
const COLON_LOCATOR_TARGET = new RegExp(String.raw`^[^\s:]*\.[A-Za-z][A-Za-z0-9]*${COLON_POSITION}$`);

/** A link some editors write to open a file: `vscode://file/abs/path:line:col`. Group 1 is the path. */
const EDITOR_FILE_URL = /^(?:vscode|vscode-insiders|vscodium|cursor|windsurf):\/\/file(\/.*)$/i;

/** The hosts a `file://` URL names a WSL distribution by. */
const WSL_HOST = /^(?:wsl\.localhost|wsl\$)$/i;

/** True for a Windows drive-rooted path (`C:/…` or `C:\…`), matching `joinProjectPath`. */
function isWindowsAbsolute(href: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(href);
}

/**
 * True for a Windows UNC path written with backslashes (`\\host\share\…`). The IDE
 * hands the webview a WSL project folder in this form (`\\wsl$\Ubuntu\home\me\proj`),
 * so a relative link resolved against it must keep the `\\host\share` root intact.
 */
function isWindowsUnc(href: string): boolean {
  return /^\\\\[^\\/]/.test(href);
}

/** True for a path under the home folder (`~/…`). */
function isHomePath(href: string): boolean {
  return /^~[\\/]/.test(href);
}

/**
 * Strip a `file://` URL (or an editor's `vscode://file/…`) down to the plain path it
 * names, or `null` if the href is not one for THIS machine.
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
 * empty host, `localhost` or a WSL host names this machine. Percent-escapes are
 * left for {@link parseMarkdownFileLink} to decode, and Windows `file:///C:/…`
 * yields `/C:/…`, already the exact carry form that function expects.
 */
export function fileUrlToPath(href: string): string | null {
  const editor = EDITOR_FILE_URL.exec(href);
  if (editor) return editor[1];
  const match = /^file:\/\/([^/]*)(\/.*)$/i.exec(href);
  if (!match) return null;
  const [, host, path] = match;
  if (WSL_HOST.test(host)) return `//${host}${path}`;
  if (host !== '' && host.toLowerCase() !== 'localhost') return null;
  return path;
}

/**
 * Parse a markdown link href into a local {@link MarkdownFileLink}, or `null`
 * for external hrefs (which keep normal link behavior).
 *
 * Local = POSIX-rooted (`/…`), Windows drive-rooted (`C:/…`, `C:\…`), UNC, under
 * the home folder (`~/…`), or relative (`./…`, `../…`). Protocol (`https:`,
 * `mailto:`) and protocol-relative (`//host`) URLs are external. The line position
 * and a leading `./` are stripped and the path is percent-decoded to match the
 * on-disk name.
 */
export function parseMarkdownFileLink(href: string): MarkdownFileLink | null {
  if (typeof href !== 'string' || href.length === 0) return null;

  // A `file://` href reaching here un-rewritten (e.g. a link built in code rather
  // than passed through the preprocessor) names the same local file.
  const fromUrl = fileUrlToPath(href);
  if (fromUrl !== null) href = fromUrl.startsWith('//') ? toLocalFileHref(fromUrl) : fromUrl;

  const isPosixAbsolute = href.startsWith('/') && !href.startsWith('//'); // exclude protocol-relative //host
  const isRelative = href.startsWith('./') || href.startsWith('../');
  if (!isPosixAbsolute && !isWindowsAbsolute(href) && !isWindowsUnc(href) && !isHomePath(href) && !isRelative) {
    return null;
  }

  // `#L10C5` wins; otherwise a `:10` / `:10:5` tail after a file extension is the position.
  // The tail is read from the END of the href, so a drive colon (`D:/…`) is never mistaken for it.
  const anchor = LINE_ANCHOR.exec(href);
  const tail = anchor ? null : COLON_LOCATOR.exec(href);
  const match = anchor ?? tail;
  const line = match ? Number(match[1]) : undefined;
  const column = match && match[2] ? Number(match[2]) : undefined;

  let path = href.replace(anchor ? LINE_ANCHOR : COLON_LOCATOR, '').replace(/^\.\//, '');
  // A UNC path travels as `/%2F%2Fhost/share/…` (see toLocalFileHref); drop the carry `/`.
  if (/^\/%2F%2F/i.test(path)) path = path.slice(1);
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed percent-escape — keep the raw path rather than throw.
  }
  // A Windows drive path and a home path travel as `/C:/…` and `/~/…` (leading slash so
  // rehype-sanitize doesn't parse `C:` as a URL scheme and strip the link). Read after
  // decoding, so an encoded drive colon (`/c%3A/…`) is restored too.
  if (/^\/(?:[A-Za-z]:|~)[\\/]/.test(path)) path = path.slice(1);

  return { path, line, column };
}

/**
 * Render a resolved local path as a link href that survives rehype-sanitize.
 * Forward-slashes it (via {@link normalizeDotSegments}) and prefixes a Windows
 * drive path with `/` so `C:` is not parsed as a URL scheme (`C:/proj` →
 * `/C:/proj`); {@link parseMarkdownFileLink} strips that leading `/` back off.
 * A home path is carried the same way, and spaces are percent-encoded because a
 * markdown destination ends at the first one.
 */
export function toLocalFileHref(path: string): string {
  const normalized = normalizeDotSegments(path).replace(/ /g, '%20');
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('~/')) return `/${normalized}`;
  // A UNC path (`//host/share/…`) would read as a protocol-relative URL, which is
  // external. Carry its leading slashes percent-encoded behind a single `/`;
  // {@link parseMarkdownFileLink} decodes them back.
  if (normalized.startsWith('//')) return `/%2F%2F${normalized.slice(2)}`;
  return normalized;
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
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(?:[\\/]+|$)/.exec(p);
  let prefix = '';
  let rest = p;
  if (drive) {
    prefix = `${drive[1]}/`;
    rest = p.slice(drive[0].length);
  } else if (unc) {
    // `\\host\share` is the root: `..` must never climb above it.
    prefix = `//${unc[1]}/${unc[2]}/`;
    rest = p.slice(unc[0].length);
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

/** `name.ext`, possibly followed by a `#fragment` or a line position: how a path with spaces ends. */
const FILE_NAME_END = new RegExp(String.raw`\.[A-Za-z][A-Za-z0-9]*(?:#.*|${COLON_POSITION})?$`);

/**
 * True when the destination of a link names a file on this machine. A destination
 * with spaces left in it is only taken for one when it ends like a file name:
 * `[see](the notes below)` stays as written.
 */
function isLocalTarget(url: string): boolean {
  if (url === '') return false;
  if (/\s/.test(url) && !FILE_NAME_END.test(url)) return false;
  if (isWindowsAbsolute(url) || isWindowsUnc(url) || COLON_LOCATOR_TARGET.test(url)) return true;
  // A single-letter "scheme" followed by / or \ is a Windows drive, not a URL scheme.
  // `name.py:9` also starts with something that looks like a scheme (`name.py:`): it is a file position.
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith('//') && !url.startsWith('#') && !/^www\./i.test(url);
}

/** The href a link destination is rewritten to, or `null` to leave the link as written. */
function localHref(written: string, workingDir: string | null | undefined): string | null {
  // `file://` names a path on this machine — unwrap it so the local-file
  // handling below carries it (see fileUrlToPath for why it cannot stay a URL).
  const url = fileUrlToPath(written) ?? written;
  if (url !== written && url.startsWith('//')) return toLocalFileHref(url);
  if (!isLocalTarget(url)) return null;
  if (url.startsWith('/') || isWindowsAbsolute(url) || isWindowsUnc(url) || isHomePath(url)) return toLocalFileHref(url);
  if (workingDir) return toLocalFileHref(resolveFilePath(url, workingDir));
  const relative = url.replace(/ /g, '%20').replace(/\\/g, '/');
  return relative.startsWith('./') || relative.startsWith('../') ? relative : `./${relative}`;
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
  const rewriteLink = ({ image, label, url, title }: MarkdownLinkSpan, source: string): string => {
    if (image) return source;
    const href = localHref(url, workingDir);
    return href === null ? source : `[${label}](${href}${title})`;
  };

  const rewritten = replaceMarkdownLinks(masked, rewriteLink).replace(
    REFERENCE_DEFINITION,
    (line, lead: string, destination: string, rest: string) => {
      const url = destination.startsWith('<') ? destination.slice(1, -1) : destination;
      const href = localHref(url, workingDir);
      return href === null ? line : `${lead}${href}${rest}`;
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
