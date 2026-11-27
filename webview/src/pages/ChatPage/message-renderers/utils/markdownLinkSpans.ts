/**
 * Where the links of a markdown text are, read the way markdown reads them: brackets
 * nest in the label (`[app/[id]/page.tsx]`), parentheses nest in the destination
 * (`app/(group)/page.tsx`), and a destination may be wrapped in `<…>`. A pattern that
 * stops at the first `]` or `)` cuts such a link in half, and the rewritten half is a
 * link that opens nothing (#708).
 *
 * Code spans and fences must be masked out by the caller beforehand.
 */
export interface MarkdownLinkSpan {
  /** Index of the opening `[` (of the `!` for an image). */
  start: number;
  /** Index just past the closing `)`. */
  end: number;
  image: boolean;
  label: string;
  /** The destination as written, without `<…>`. */
  url: string;
  /** The title with the space before it (` "Title"`), or ''. */
  title: string;
}

/**
 * A line that is a link reference definition and nothing else: `[id]: destination "title"`.
 * Groups: what leads to the destination, the destination, the rest of the line.
 */
export const REFERENCE_DEFINITION =
  /^( {0,3}\[[^\]^\n][^\]\n]*\]:[ \t]*)(<[^>\n]*>|\S+)((?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?[ \t]*)$/gm;

/** A trailing `"title"` / `'title'` after the destination. */
const TRAILING_TITLE = /\s+(?:"[^"]*"|'[^']*')\s*$/;

/** No label or destination is longer than this; it keeps a text full of `[` quick to scan. */
const MAX_PART_LENGTH = 2000;

/** The index of the bracket that closes the one at `open`, on the same paragraph, or -1. */
function closingIndex(text: string, open: number, opener: string, closer: string, stopAtNewline: boolean): number {
  let depth = 0;
  const limit = Math.min(text.length, open + MAX_PART_LENGTH);
  for (let i = open; i < limit; i++) {
    const char = text[i];
    if (char === '\n' && (stopAtNewline || text[i + 1] === '\n')) return -1;
    // `\]` is not a bracket. In a destination a backslash is mostly a Windows separator,
    // so only an escaped bracket or backslash is skipped.
    if (char === '\\' && (text[i + 1] === opener || text[i + 1] === closer || text[i + 1] === '\\')) {
      i++;
      continue;
    }
    if (char === opener) depth++;
    else if (char === closer && --depth === 0) return i;
  }
  return -1;
}

/** Split what stands between `(` and `)` into the destination and the title. */
function splitDestination(inside: string): Pick<MarkdownLinkSpan, 'url' | 'title'> {
  const trimmed = inside.trim();
  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>');
    if (close > 0) return { url: trimmed.slice(1, close), title: trimmed.slice(close + 1) };
  }
  const title = TRAILING_TITLE.exec(trimmed)?.[0] ?? '';
  return { url: trimmed.slice(0, trimmed.length - title.length), title: title.trimEnd() };
}

/** Every inline link and image in `text`, in order, never one inside another. */
function findMarkdownLinks(text: string): MarkdownLinkSpan[] {
  const spans: MarkdownLinkSpan[] = [];
  for (let open = text.indexOf('['); open !== -1; open = text.indexOf('[', open + 1)) {
    const labelEnd = closingIndex(text, open, '[', ']', false);
    if (labelEnd === -1 || text[labelEnd + 1] !== '(') continue;
    const close = closingIndex(text, labelEnd + 1, '(', ')', true);
    if (close === -1) continue;
    const image = open > 0 && text[open - 1] === '!';
    spans.push({
      start: image ? open - 1 : open,
      end: close + 1,
      image,
      label: text.slice(open + 1, labelEnd),
      ...splitDestination(text.slice(labelEnd + 2, close)),
    });
    open = close;
  }
  return spans;
}

/** `text` with each link replaced by what `replace` returns for it. */
export function replaceMarkdownLinks(text: string, replace: (span: MarkdownLinkSpan, source: string) => string): string {
  let result = '';
  let cursor = 0;
  for (const span of findMarkdownLinks(text)) {
    result += text.slice(cursor, span.start) + replace(span, text.slice(span.start, span.end));
    cursor = span.end;
  }
  return result + text.slice(cursor);
}
