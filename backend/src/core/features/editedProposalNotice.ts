/**
 * Tell Claude that the edit it proposed was corrected before it was applied
 * (#305).
 *
 * The permission protocol has no room for this. `updatedInput` changes what the
 * CLI writes but not what the model remembers: the transcript keeps the model's
 * own `tool_use`, and the `tool_result` for a write is a single success line
 * with no contents (both measured). So a reviewer who fixes 20000 to 15000 gets
 * the right file and an assistant that goes on believing it wrote 20000 —
 * including in whatever it writes next that references the value.
 *
 * The one channel that reaches the model is a user message, and
 * `<system-reminder>` is the CLI's own idiom for text the model reads but the
 * transcript does not show as speech. Our webview strips the tag before
 * rendering (see webview parseUserContent), so nothing appears in the chat.
 *
 * Sent as its own message rather than folded into the reviewer's next one: a
 * conversation that ends right after the edit would otherwise never carry it,
 * and the correction is worth least when it arrives last.
 */

/** What the reviewer's correction changed, as it was written to the file. */
export interface EditedProposalChange {
  /** The text as the file had it before this write. */
  oldText: string;
  /** The text the reviewer actually applied. */
  newText: string;
}

/**
 * The reminder to send, or null when there is nothing to say.
 *
 * Deliberately carries the applied text verbatim rather than a summary of it.
 * The pair is the one the CLI was handed, so quoting it cannot drift from what
 * landed on disk — and it is already computed, so this invents nothing.
 *
 * Not truncated. A whole-file rewrite makes a large pair, and a reminder that
 * silently drops half of it would be worse than a long one: the model would
 * read a partial change as the complete one.
 */
export function buildEditedProposalNotice(change: EditedProposalChange | null): string | null {
  if (!change) return null;
  if (change.oldText === change.newText) return null;

  const body = [
    'The user edited your proposed change before applying it.',
    'This is what was actually written to the file:',
    '',
    '```diff',
    ...change.oldText.split('\n').map((line) => `- ${line}`),
    ...change.newText.split('\n').map((line) => `+ ${line}`),
    '```',
    '',
    // Without this the assistant tends to narrate the correction back, which
    // reads as a second answer to a question already settled. Given that a
    // reply may come anyway, the wording steers it to one that is at least
    // true and short.
    'Do not explain or ask about this notice. If you must reply at all, say only',
    '"I have taken your edits into account." — otherwise continue without comment.',
  ].join('\n');

  return `<system-reminder>\n${body}\n</system-reminder>`;
}
