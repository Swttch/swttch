/**
 * Spans that must never be scanned for a bare file reference: fenced code
 * blocks, inline code, markdown images/links, autolinks / raw HTML tags, and
 * scheme URLs (so a `http://host:8080/a/b.js:10` is left alone). Masked out
 * before the scan and restored after, exactly like `normalizeMarkdownLinkUrls`.
 */
const MASKED_SPANS =
  /```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*?`+|!?\[[^\]]*\]\([^)]*\)|<[^>\s]+>|\b[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g;

/**
 * A bare plain-text source reference: a path with a file extension followed by
 * a line locator. Captures — (1) path, then either (2) line / (3) column from a
 * `:line:col`, or (4) line / (5) column from a `#Lline[Ccol][-…]` anchor.
 *
 * The path allows a `/`, `./`, `../` lead and any number of `dir/` segments; the
 * slash requirement (a path must contain `/`) is enforced in the callback so a
 * lead-only `./foo.ts` still matches. The left lookbehind keeps the match from
 * starting in the middle of a larger token.
 */
const PLAINTEXT_FILE_REF =
  /(?<![\w@/.\-#])((?:\.{0,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.[A-Za-z][A-Za-z0-9]*)(?::(\d+)(?::(\d+))?|#L(\d+)(?:C(\d+))?(?:-L\d+(?:C\d+)?)?)?(?![\w/-])/g;

/**
 * An inline code span that holds nothing but one such path (and its locator).
 * Claude Desktop draws that as a link, not as code, so it is rewritten to one.
 */
const CODE_SPAN_PATH =
  /`([^`\n]*\/[^`\n]*)`/g;
const WHOLE_PATH =
  /^((?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z][A-Za-z0-9]*)(?::(\d+)(?::(\d+))?|#L(\d+)(?:C(\d+))?(?:-L\d+(?:C\d+)?)?)?$/;

/**
 * NUL wrapper for a masked span. A raw NUL never appears in chat markdown, so a
 * `NUL<index>NUL` slot cannot collide with real text the way a space-padded
 * number could (a bare " 5 " in prose). Built at runtime to keep the source ASCII.
 */
const NUL = String.fromCharCode(0);
const MASK_SLOT = new RegExp(`${NUL}(\\d+)${NUL}`, 'g');

/**
 * Turn bare plain-text source references in assistant markdown into clickable
 * links, so they open in the IDE via {@link MarkdownFileLink} just like an
 * explicit markdown link. Recognizes a slash-bearing path with a file extension
 * followed by a line locator — `src/app.ts:42`, `src/app.ts:42:7`,
 * `src/example/File.java#L10-L25` — and rewrites it to
 * `[<original text>](<path>#L42[C7])`, leaving href resolution (relative → the
 * working dir, sanitize-safe form) to {@link normalizeMarkdownLinkUrls} downstream.
 *
 * Deliberately conservative to avoid linkifying prose:
 * - the path MUST contain a `/` (a bare `App.java:10` or `example.com:8080` is
 *   left alone) and end in a `name.ext` segment;
 * - a line locator (`:line`, `:line:col`, or `#L…`) is REQUIRED (so a plain
 *   `10:30` time or a mention of `src/app.ts` with no line is left alone);
 * - references inside code spans/fences, existing markdown links/images, and
 *   URLs are never touched.
 */
export function linkifyPlainTextFileRefs(markdown: string): string {
  // A code span that is only a path becomes a link first (fenced blocks are left whole).
  const pathCodeSpansAsLinks = markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(CODE_SPAN_PATH, (span, inner: string) => {
            const match = WHOLE_PATH.exec(inner.trim());
            if (!match) return span;
            const [, path, colonLine, colonCol, anchorLine, anchorCol] = match;
            const line = colonLine ?? anchorLine;
            const column = colonCol ?? anchorCol;
            return `[${inner.trim()}](${path}${line ? `#L${line}${column ? `C${column}` : ''}` : ''})`;
          }),
    )
    .join('');
  markdown = pathCodeSpansAsLinks;
  const masked: string[] = [];
  const withoutSpans = markdown.replace(
    MASKED_SPANS,
    (span) => `${NUL}${masked.push(span) - 1}${NUL}`,
  );

  const linkified = withoutSpans.replace(
    PLAINTEXT_FILE_REF,
    (full, path: string, colonLine, colonCol, anchorLine, anchorCol) => {
      // A path must contain a directory separator; a bare `name.ext:line`
      // (e.g. `example.com:8080`, `App.java:10`) is too ambiguous to linkify.
      if (!path.includes('/')) return full;
      const line = colonLine ?? anchorLine;
      const column = colonCol ?? anchorCol;
      // A path with no line locator opens at the top of the file.
      const anchor = line ? `#L${line}${column ? `C${column}` : ''}` : '';
      return `[${full}](${path}${anchor})`;
    },
  );

  return linkified.replace(MASK_SLOT, (_, index) => masked[Number(index)]);
}
