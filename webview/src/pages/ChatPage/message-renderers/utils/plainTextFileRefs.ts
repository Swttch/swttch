import { COLON_POSITION } from './fileLocator';
import { REFERENCE_DEFINITION, replaceMarkdownLinks } from './markdownLinkSpans';

/** Fenced code blocks. Captured, so a split keeps them as the odd parts. */
const FENCED_BLOCKS = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/;

/**
 * Spans that must never be scanned for a bare file reference, besides markdown
 * links, images and reference definitions (set aside first): fenced code blocks,
 * inline code, autolinks / raw HTML tags, and scheme URLs (so a
 * `http://host:8080/a/b.js:10` is left alone). Masked out before the scan and
 * restored after, exactly like `normalizeMarkdownLinkUrls`.
 */
const MASKED_SPANS = /```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*?`+|<[^>\s]+>|\b[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g;

/*
 * The parts a path is made of. Folder and file names are not only ASCII: a path
 * through `数据中心/` or `문서/` has to be taken whole, because taking only its tail
 * makes a link to a file that does not exist (#708).
 */
/** A letter or digit outside ASCII. */
const OTHER_LETTER = String.raw`(?![A-Za-z0-9_])[\p{L}\p{M}\p{N}]`;
const ASCII_CHAR = String.raw`[A-Za-z0-9_.@+\-]`;
/** A framework route folder: `[id]`, `[...slug]`, `[[...slug]]`, `(group)`. */
const BRACKETED = String.raw`(?:\[\[?[\w.\-]+\]?\]|\([\w.\-]+\))`;
/** Any folder or file name. */
const NAME = `(?:${ASCII_CHAR}|${OTHER_LETTER}|${BRACKETED})+`;
/**
 * The first folder of a relative path is either ASCII or not ASCII at all, so that
 * prose glued to a path (`请看docs/a.md`) is not taken into it. A non-ASCII one is
 * only tried where such a run begins: tried at every letter, a long paragraph with no
 * space in it takes seconds to scan.
 */
const FIRST_NAME = String.raw`(?:(?:${ASCII_CHAR}|${BRACKETED})+|(?<!${OTHER_LETTER})(?:${OTHER_LETTER})(?:${OTHER_LETTER}|[0-9_.\-])*)`;
const SEPARATOR = String.raw`[\\/]`;
const FILE_NAME = String.raw`${NAME}\.[A-Za-z][A-Za-z0-9]*`;

/** A drive, `~`, `./`, `../` or a root slash that does not follow a letter (which would make it a path's middle). */
const ROOT = String.raw`(?:[A-Za-z]:[\\/]|(?:~|\.{1,2})[\\/]|(?<![\p{L}\p{M}\p{N}\])])\/)`;

/** `:42`, `:42:7`, `:10-20` (groups 1, 2) or `#L42C7-L50` (groups 3, 4). */
const POSITION = String.raw`(?:${COLON_POSITION}|#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?)?`;

/**
 * A bare plain-text source reference: a path with a file extension, optionally
 * followed by a line locator. Captures the path, then the locator's groups.
 * The path is a root or a first folder, any further folders and a file name, with
 * either separator: a bare `name.ext` is never matched.
 * The left lookbehind keeps the match from starting in the middle of a larger token.
 */
const PLAINTEXT_FILE_REF = new RegExp(
  String.raw`(?<![A-Za-z0-9_@+~/\\.\-#])` +
    `((?:${ROOT}(?:${NAME}${SEPARATOR})*|${FIRST_NAME}${SEPARATOR}(?:${NAME}${SEPARATOR})*)${FILE_NAME})` +
    POSITION +
    String.raw`(?![A-Za-z0-9_/\\\-])`,
  'gu',
);

/**
 * An inline code span that holds nothing but one such path (and its locator).
 * Claude Desktop draws that as a link, not as code, so it is rewritten to one.
 */
const CODE_SPANS = /`+[^`\n]*?`+/g;
const PATH_CODE_SPAN = /^`([^`\n]*[\\/][^`\n]*)`$/;
const WHOLE_PATH = new RegExp(
  `^((?:${ROOT}(?:${NAME}${SEPARATOR})*|(?:${NAME}${SEPARATOR})+)${FILE_NAME})${POSITION}$`,
  'u',
);

/**
 * NUL wrapper for a masked span. A raw NUL never appears in chat markdown, so a
 * `NUL<index>NUL` slot cannot collide with real text the way a space-padded
 * number could (a bare " 5 " in prose). Built at runtime to keep the source ASCII.
 */
const NUL = String.fromCharCode(0);
const MASK_SLOT = new RegExp(`${NUL}(\\d+)${NUL}`, 'g');

/**
 * True for backslashes alone with nothing else saying it is a path (`DOMAIN\john.doe`):
 * such text is only a file reference when it starts like a path or names a line.
 */
function isAmbiguous(path: string, line: string | undefined): boolean {
  return !path.includes('/') && !/^(?:[A-Za-z]:|\.{1,2}\\|~\\)/.test(path) && line === undefined;
}

/** The link written for a found reference; the label shows the text as it was. */
function fileLink(label: string, path: string, line?: string, column?: string): string {
  const anchor = line ? `#L${line}${column ? `C${column}` : ''}` : '';
  // A backslash before punctuation is an escape in markdown: double it so a Windows path keeps it.
  const shown = label.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\');
  return `[${shown}](${path}${anchor})`;
}

/**
 * Turn bare plain-text source references in assistant markdown into clickable
 * links, so they open in the IDE via {@link MarkdownFileLink} just like an
 * explicit markdown link. Recognizes a path with a separator and a file
 * extension — `src/app.ts:42`, `src\app.ts:42:7`, `~/notes/a.md`,
 * `src/example/File.java#L10-L25` — and rewrites it to
 * `[<original text>](<path>#L42[C7])`, leaving href resolution (relative → the
 * working dir, sanitize-safe form) to {@link normalizeMarkdownLinkUrls} downstream.
 *
 * Deliberately conservative to avoid linkifying prose:
 * - the path MUST contain a separator (a bare `App.java:10` or `example.com:8080`
 *   is left alone) and end in a `name.ext` segment; with backslashes only, it must
 *   also start like a path or name a line;
 * - references inside code spans/fences, existing markdown links/images, and
 *   URLs are never touched.
 */
export function linkifyPlainTextFileRefs(markdown: string): string {
  const masked: string[] = [];
  const mask = (span: string) => `${NUL}${masked.push(span) - 1}${NUL}`;
  // Fences first, so nothing inside them is read as a link or a code span.
  const outsideFences = (text: string, change: (part: string) => string) =>
    text
      .split(FENCED_BLOCKS)
      .map((part, index) => (index % 2 === 1 ? part : change(part)))
      .join('');

  // Code spans are set aside first, so a bracket inside code is never read as a link's,
  // then existing links: a path in a link's label (`[`src/a.ts`](src/a.ts)`) must not
  // become a link inside that link.
  const withoutCode = outsideFences(markdown, (part) => part.replace(CODE_SPANS, mask));
  const withoutLinks = outsideFences(withoutCode, (part) =>
    replaceMarkdownLinks(part, (_, source) => mask(source)).replace(REFERENCE_DEFINITION, mask),
  );

  // A code span that is only a path, and is not part of a link, becomes a link.
  const pathCodeSpansAsLinks = outsideFences(withoutLinks, (part) =>
    part.replace(MASK_SLOT, (slot, index) => {
      const inner = PATH_CODE_SPAN.exec(masked[Number(index)])?.[1].trim();
      const match = inner === undefined ? null : WHOLE_PATH.exec(inner);
      if (!match) return slot;
      const [, path, colonLine, colonColumn, anchorLine, anchorColumn] = match;
      const line = colonLine ?? anchorLine;
      if (isAmbiguous(path, line)) return slot;
      return mask(fileLink(match[0], path, line, colonColumn ?? anchorColumn));
    }),
  );

  const withoutSpans = pathCodeSpansAsLinks.replace(MASKED_SPANS, mask);

  const linkified = withoutSpans.replace(
    PLAINTEXT_FILE_REF,
    (full, path: string, colonLine, colonColumn, anchorLine, anchorColumn) => {
      const line = colonLine ?? anchorLine;
      if (isAmbiguous(path, line)) return full;
      // A path with no line locator opens at the top of the file.
      return fileLink(full, path, line, colonColumn ?? anchorColumn);
    },
  );

  // A masked span can hold another one (a code span inside a link's label), so restore until none is left.
  let restored = linkified;
  while (restored.includes(NUL)) restored = restored.replace(MASK_SLOT, (_, index) => masked[Number(index)]);
  return restored;
}
