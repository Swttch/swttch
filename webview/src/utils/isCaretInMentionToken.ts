/**
 * True when the caret sits inside an `@mention` token — i.e. the user is
 * currently picking a file rather than typing the command itself.
 *
 * The slash command panel and the mention dropdown occupy the same slot above
 * the composer, so only one may render at a time. Deciding by "does the input
 * start with `/`" alone kept the slash panel pinned open for the whole line,
 * which hid the mention dropdown for every `/command @file` input (issue #236).
 * Asking where the caret is instead lets both features share the slot: the
 * mention wins while the caret is in its token, the command panel wins
 * everywhere else.
 *
 * The trigger rules mirror {@link useMention.detectMention} exactly — an `@`
 * must start a line or follow a space, and a whitespace character ends the
 * query. Keep the two in sync: a mention the dropdown would not offer must not
 * displace the command panel either.
 */
export function isCaretInMentionToken(value: string, caretPosition: number): boolean {
  const textBeforeCaret = value.slice(0, caretPosition);

  const lastAtIndex = textBeforeCaret.lastIndexOf('@');
  if (lastAtIndex === -1) return false;

  // `@` must begin a line or follow a space, so emails ("fred@example.com")
  // and other glued-on markers never count as mentions.
  const charBeforeAt = lastAtIndex > 0 ? value[lastAtIndex - 1] : null;
  const isValidTrigger = charBeforeAt === null || charBeforeAt === ' ' || charBeforeAt === '\n';
  if (!isValidTrigger) return false;

  // Any whitespace after the `@` settles the mention — the caret has moved on.
  const queryText = textBeforeCaret.slice(lastAtIndex + 1);
  return !/\s/.test(queryText);
}
