/**
 * The `@@` token the caret currently sits in, or `null` when the caret is not
 * inside one.
 */
export interface AgentToken {
  /** Text between the `@@` and the caret-side end of the token ("re" in "@@re"). */
  query: string;
  /** Offset of the first `@`. */
  start: number;
  /** Offset just past the token — where the query ends. */
  end: number;
}

/** The characters that open the active-session panel. */
export const AGENT_TRIGGER = '@@';

/**
 * Locate the active-session token around the caret.
 *
 * The trigger is two at-signs because a single `@` already means a file
 * reference, in the CLI and in this composer alike. Two is free: the file
 * mention detector refuses `@@` for a reason that has nothing to do with this
 * panel, and so leaves the keystroke unclaimed.
 *
 * That refusal is the same rule enforced here — the marker must start a line or
 * follow a space, which exists so an email address ("fred@example.com") is not
 * read as a mention. In `@@`, the second at-sign is preceded by the first, so
 * `isCaretInMentionToken` and `useMention.detectMention` both reject it and the
 * file panel closes on its own. Nothing arbitrates between the two panels
 * because they can never both want the same token.
 *
 * The rules mirror {@link findPromptToken}, {@link findSlashCommandToken} and
 * {@link isCaretInMentionToken}: keeping all four symmetric is what lets them
 * share the single slot above the composer (issues #236, #244, #314).
 */
export function findAgentToken(value: string, caretPosition: number): AgentToken | null {
  const textBeforeCaret = value.slice(0, caretPosition);

  const lastTriggerIndex = textBeforeCaret.lastIndexOf(AGENT_TRIGGER);
  if (lastTriggerIndex === -1) return null;

  // `@@` must begin a line or follow a space, so "a@@b" never opens the panel
  // mid-word. A third at-sign lands here too: in "@@@" the rightmost `@@` is
  // preceded by an `@`, so the panel closes rather than treating it as a query.
  const charBeforeTrigger = lastTriggerIndex > 0 ? value[lastTriggerIndex - 1] : null;
  const isValidTrigger =
    charBeforeTrigger === null || charBeforeTrigger === ' ' || charBeforeTrigger === '\n';
  if (!isValidTrigger) return null;

  // Any whitespace after the `@@` settles the token — the caret has moved on to
  // the message the mention was meant to address.
  const query = textBeforeCaret.slice(lastTriggerIndex + AGENT_TRIGGER.length);
  if (/\s/.test(query)) return null;

  return { query, start: lastTriggerIndex, end: caretPosition };
}
