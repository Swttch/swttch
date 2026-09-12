/**
 * The `!!` token the caret currently sits in, or `null` when the caret is not
 * inside one.
 */
export interface PromptToken {
  /** Text between the `!!` and the caret-side end of the token ("me" in "!!me"). */
  query: string;
  /** Offset of the first `!`. */
  start: number;
  /** Offset just past the token — where the query ends. */
  end: number;
}

/** The characters that open the prompt library panel. */
export const PROMPT_TRIGGER = '!!';

/**
 * Locate the prompt library token around the caret.
 *
 * The trigger is two bangs rather than one because the Claude Code CLI already
 * assigns a single leading `!` to shell mode, and the composer must not give the
 * same keystroke a different meaning than the terminal does. Two bangs are not a
 * CLI shortcut at all: the CLI strips exactly one leading `!` and runs the rest
 * as a command, so it has no second-bang behaviour to contradict.
 *
 * The trigger rules mirror {@link findSlashCommandToken} and
 * {@link isCaretInMentionToken}: the marker must start a line or follow a space,
 * and whitespace ends the query. Keeping the three symmetric is what lets them
 * share the single slot above the composer — a token one of them would not offer
 * must not displace the others either (issues #236, #244).
 */
export function findPromptToken(value: string, caretPosition: number): PromptToken | null {
  const textBeforeCaret = value.slice(0, caretPosition);

  const lastTriggerIndex = textBeforeCaret.lastIndexOf(PROMPT_TRIGGER);
  if (lastTriggerIndex === -1) return null;

  // `!!` must begin a line or follow a space, so "wow!!" and "a!!b" never open
  // the panel mid-word.
  const charBeforeTrigger = lastTriggerIndex > 0 ? value[lastTriggerIndex - 1] : null;
  const isValidTrigger =
    charBeforeTrigger === null || charBeforeTrigger === ' ' || charBeforeTrigger === '\n';
  if (!isValidTrigger) return null;

  // Any whitespace after the `!!` settles the token — the caret has moved on to
  // the sentence the prompt was meant to start.
  const query = textBeforeCaret.slice(lastTriggerIndex + PROMPT_TRIGGER.length);
  if (/\s/.test(query)) return null;

  return { query, start: lastTriggerIndex, end: caretPosition };
}
