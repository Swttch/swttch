/**
 * The text that mentions a file in a message, as the Claude Code CLI reads it:
 * `@path`, or `@"path"` when the path has a space in it. Without the quotes the
 * CLI, and our own chip, end the path at the first space (#708).
 * A line range belongs to the path and goes inside the quotes.
 */
export function formatFileMention(path: string): string {
  return /\s/.test(path) ? `@"${path}"` : `@${path}`;
}
