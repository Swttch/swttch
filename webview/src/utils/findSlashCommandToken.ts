/**
 * The `/command` token the caret currently sits in, or `null` when the caret is
 * not inside one.
 */
export interface SlashCommandToken {
  /** Text between the `/` and the caret-side end of the token ("mo" in "/mo"). */
  query: string;
  /** Offset of the `/` itself. */
  start: number;
  /** Offset just past the token — where the query ends. */
  end: number;
}

/**
 * Locate the slash command token around the caret.
 *
 * The panel used to open on `value.startsWith('/')` alone, so a `/` typed after
 * any other text was invisible to it — the user could not reach a skill or a
 * CLI command once a prompt had been started (issue #244).
 *
 * The trigger rules mirror {@link isCaretInMentionToken} and
 * `useMention.detectMention`: the marker must start a line or follow a space,
 * and whitespace ends the query. A second `/` inside the token means a path
 * ("/src/utils"), not a command, so it disqualifies the token as well — which
 * is what keeps "see src/utils" from opening the panel.
 */
export function findSlashCommandToken(value: string, caretPosition: number): SlashCommandToken | null {
  const textBeforeCaret = value.slice(0, caretPosition);

  const lastSlashIndex = textBeforeCaret.lastIndexOf('/');
  if (lastSlashIndex === -1) return null;

  // `/` must begin a line or follow a space, so paths ("src/utils") and URLs
  // never count as commands.
  const charBeforeSlash = lastSlashIndex > 0 ? value[lastSlashIndex - 1] : null;
  const isValidTrigger = charBeforeSlash === null || charBeforeSlash === ' ' || charBeforeSlash === '\n';
  if (!isValidTrigger) return null;

  // Any whitespace after the `/` settles the command — the caret has moved on
  // to arguments, which the panel handles through its own argument mode.
  const query = textBeforeCaret.slice(lastSlashIndex + 1);
  if (/\s/.test(query)) return null;

  return { query, start: lastSlashIndex, end: caretPosition };
}
