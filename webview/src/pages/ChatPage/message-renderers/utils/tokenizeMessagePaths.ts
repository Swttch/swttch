import {
  SESSION_MENTION_PATTERN,
  readSessionMention,
  type SessionMention,
} from '../../ChatInput/sessionMentionTag';

/**
 * A contiguous run of a submitted user message, classified for chip rendering.
 * `isPath` runs are `@`-prefixed file/folder mentions that render as clickable
 * chips; plain runs render as text (preserving whitespace/newlines).
 *
 * `mention` marks a `<session-mention>` element — another live Claude session
 * the user addressed. It is a chip too, but not a path: nothing about it opens,
 * and `text` is already the display label with the markup taken off.
 */
export interface MessageSegment {
  text: string;
  isPath: boolean;
  mention?: SessionMention;
}

/**
 * Matches an `@`-prefixed path mention inside a submitted message.
 *
 * - `@` opens the token.
 * - `\S*` greedily absorbs the body (any non-space run, e.g. `src/file.ts`,
 *   `src/file.ts#L10-L25`, `src/utils/`).
 * - `[^\s.,;:!?)\]}]` forces the LAST captured character to be a non-trailing
 *   punctuation char, so a sentence-ending mark is left as plain text
 *   (`@file.ts.` → token `@file.ts` + plain `.`). A bare `@` cannot match
 *   because at least one valid final char is required.
 *
 * Folder mentions end in `/`, which is intentionally NOT in the excluded set,
 * so `@src/utils/` keeps its trailing slash.
 */
const PATH_TOKEN_PATTERN = /@\S*[^\s.,;:!?)\]}]/g;

/**
 * A match that is a session mention rather than a file one, and so is not a
 * path at all.
 *
 * `@@` addresses another live Claude session. The pattern above cannot tell the
 * two apart on its own: it opens on the first `@`, absorbs the second, and
 * stops at the first space — so `@@fix the proxy` surfaced as a chip reading
 * `@@fix`, which then offered to open a file named `@fix`. Wrong on both counts,
 * and the clickable half is the dangerous one.
 *
 * Checked on the match rather than built into the pattern so the pattern keeps
 * saying one thing about what a path looks like.
 */
function isSessionMention(token: string): boolean {
  return token.startsWith('@@');
}

/**
 * Tokenize a submitted user message into ordered {@link MessageSegment}s.
 *
 * Plain text between matches is preserved verbatim (including whitespace and
 * newlines) so the caller can keep `whitespace-pre-wrap` layout. When the text
 * has no `@`-path mention the whole string is returned as a single plain
 * segment; an empty string yields an empty array.
 */
export function tokenizeMessagePaths(text: string): MessageSegment[] {
  if (text.length === 0) return [];

  // Session mentions are taken out first, because they are the only run here
  // whose extent the text itself declares. What is left between them is ordinary
  // prose, and only that is searched for paths.
  const segments: MessageSegment[] = [];
  const mentionPattern = new RegExp(SESSION_MENTION_PATTERN.source, 'g');
  let cursor = 0;
  let mentionMatch: RegExpExecArray | null;

  const pushProse = (prose: string) => {
    for (const segment of tokenizePaths(prose)) segments.push(segment);
  };

  while ((mentionMatch = mentionPattern.exec(text)) !== null) {
    if (mentionMatch.index > cursor) pushProse(text.slice(cursor, mentionMatch.index));
    const mention = readSessionMention(mentionMatch);
    segments.push({ text: mention.label, isPath: false, mention });
    cursor = mentionMatch.index + mentionMatch[0].length;
  }

  if (cursor < text.length) pushProse(text.slice(cursor));

  if (segments.length === 0) {
    return [{ text, isPath: false }];
  }

  return segments;
}

/** Split one run of prose into path chips and plain text. */
function tokenizePaths(text: string): MessageSegment[] {
  if (text.length === 0) return [];

  const segments: MessageSegment[] = [];
  const pattern = new RegExp(PATH_TOKEN_PATTERN.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // An unwrapped session mention — one typed by hand, or written before the
    // tag existed. Left to merge into the plain run around it rather than
    // surfaced as a chip offering to open a file named `@fix`.
    if (isSessionMention(match[0])) continue;
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isPath: false });
    }
    segments.push({ text: match[0], isPath: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isPath: false });
  }

  if (segments.length === 0) return [{ text, isPath: false }];
  return segments;
}

/**
 * Trailing GitHub-style line anchor on a path token or link href: `#L10`,
 * `#L10-L25`, or with a column, `#L10C5` / `#L10C5-L20C15`. Capture group 1 is
 * the (1-based) start line and group 2 the (1-based) start column, if present.
 * Shared by the `@`-mention helpers and the assistant markdown-link parser so
 * the recognized syntax lives in one place.
 */
export const LINE_ANCHOR = /#L(\d+)(?:C(\d+))?(?:-L\d+(?:C\d+)?)?$/;

/**
 * Normalize an `@`-path token into the path to open in the IDE.
 *
 * Strips the leading `@` and any trailing line range (`#L10` or `#L10-L25`).
 * A folder token keeps its trailing `/` so the caller can detect folders and
 * skip opening them.
 *
 * @example pathFromToken('@src/file.ts#L10-L25') // 'src/file.ts'
 * @example pathFromToken('@src/utils/')          // 'src/utils/'
 */
export function pathFromToken(token: string): string {
  return token
    .replace(/^@/, '')
    .replace(LINE_ANCHOR, '');
}

/**
 * The 1-based line from an `@`-token's trailing `#L10`/`#L10-L25` (the range's
 * start line), or `undefined` when the token carries no line anchor. Forwarded
 * to `openFile` so the mention navigates to the line, not just the file.
 *
 * @example lineFromToken('@src/file.ts#L10-L25') // 10
 * @example lineFromToken('@src/file.ts')         // undefined
 */
export function lineFromToken(token: string): number | undefined {
  const match = LINE_ANCHOR.exec(token);
  return match ? Number(match[1]) : undefined;
}

/**
 * Whether a token refers to a folder (ends with `/`). Folder chips are not
 * clickable because `openFile` opens files, not directories.
 */
export function isFolderToken(token: string): boolean {
  return pathFromToken(token).endsWith('/');
}

/**
 * Resolve a mention path (relative to the project) into an absolute path for
 * `openFile`. The IDE's file lookup (Kotlin `findFileByPath`) needs an absolute
 * path, and the backend forwards the path verbatim, so the webview must combine
 * the relative mention with the working directory here.
 *
 * Already-absolute paths pass through unchanged — POSIX (leading `/`) or
 * Windows drive-rooted (`C:/…`, `C:\…`), matching `joinProjectPath`. When the
 * working directory is unknown the relative path is returned as-is (best effort).
 */
export function resolveFilePath(relativePath: string, workingDir: string | null | undefined): string {
  if (relativePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relativePath)) return relativePath;
  if (!workingDir) return relativePath;
  return `${workingDir.replace(/[\\/]+$/, '')}/${relativePath}`;
}
