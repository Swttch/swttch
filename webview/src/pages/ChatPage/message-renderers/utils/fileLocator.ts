/**
 * How a position in a file is written after its path. Shared by the markdown-link
 * parser, the plain-text linkifier and the `@`-mention helpers so each recognizes
 * the same forms.
 */

/**
 * A GitHub-style line anchor: `#L10`, `#L10-L25`, `#L10-25`, or with a column,
 * `#L10C5` / `#L10C5-L20C15`. Group 1 is the (1-based) start line, group 2 the
 * (1-based) start column.
 */
export const LINE_ANCHOR = /#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/;

/** The source of a `:10`, `:10:5` or `:10-25` tail; groups 1 and 2 are the start line and column. */
export const COLON_POSITION = String.raw`:(\d+)(?::(\d+))?(?:-\d+(?::\d+)?)?`;
