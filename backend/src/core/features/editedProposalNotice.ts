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
 *
 * ★ Known limitation: this arrives at the END of the turn, and the assistant
 * may act before then.
 *
 * Answering a permission request does not end the turn — the CLI hands the tool
 * result back and the assistant carries on in the same one. Measured on a
 * partial approval: it read the file, found the hunk it had proposed missing,
 * called it a rejection and proposed the change again, all before the turn
 * produced a `result` and this notice could be delivered. So on that path the
 * reviewer still sees the change offered a second time.
 *
 * Delivering it any earlier is not currently possible. A permission response
 * carries text back to the model only on the `deny` branch (documented, and
 * checked against the CLI docs for allow: the fields are `updatedInput` and
 * `updatedPermissions`, and "Claude sees the result but isn't told you changed
 * anything"). Sending it mid-turn as a user message does not work either —
 * see afterTurn for why the CLI discards those.
 *
 * So the wording below is the mitigation, not a fix: it tells the assistant
 * plainly that missing parts were declined on purpose, which is worth having
 * for every later turn even when it lands too late for the first one.
 */

import { computeHunks } from './hunks';

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
export function buildEditedProposalNotice(
  change: EditedProposalChange | null,
  /**
   * Whether parts of the proposal were turned down rather than rewritten.
   *
   * The two read identically in the diff — a hunk the reviewer declined is
   * simply absent from what was written — but they mean opposite things. Told
   * only "the user edited this", the assistant reads a declined hunk as work
   * that went missing and proposes it again, which is the reviewer having to
   * refuse the same change twice (#359).
   */
  declinedParts = false,
): string | null {
  if (!change) return null;
  if (change.oldText === change.newText) return null;

  const body = [
    declinedParts
      ? 'The user chose which parts of your proposed change to apply, and declined the rest.'
      : 'The user edited your proposed change before applying it.',
    'This is what was actually written to the file:',
    '',
    '```diff',
    ...renderDiff(change),
    '```',
    '',
    // Without this the assistant tends to narrate the correction back, which
    // reads as a second answer to a question already settled.
    'Do not explain or ask about this notice.',
    '',
    // The previous wording stopped at "say only <one fixed English sentence>",
    // which left two things wrong. It answered in English to a user writing in
    // another language, and it treated the notice as something to acknowledge
    // and move past — while the reply that PRECEDED it may now be describing an
    // edit that was never applied. Acknowledging is not enough; the assistant
    // has to go back and read what actually landed.
    ...(declinedParts
      ? [
          // The decisive line. Absent it, the assistant reads its own missing
          // hunk as an omission and offers it again -- making the reviewer
          // decline the same change a second time.
          'The parts that are missing were DECLINED on purpose. They are not an',
          'omission, and you must not propose them again unless the user asks.',
          'What you said in your previous response may describe changes that were',
          'not applied. Do not restate them as done.',
        ]
      : [
          'If the user did not approve your proposal as-is but applied it with edits of',
          'their own, then what you said in your previous response may not match the',
          'change that was actually approved. In that case, send the message',
          '"I will check the additional edits you made." in THE USER\'S OWN LANGUAGE,',
          'and then review the actual edits where they differ from what you proposed.',
        ]),
  ].join('\n');

  return `<system-reminder>\n${body}\n</system-reminder>`;
}

/**
 * The change as unified-diff lines: the edited lines with a little context
 * around each, rather than both versions in full.
 *
 * Measured before this: correcting three scattered places in one file produced
 * an 80-line notice for three changed lines, because every unchanged line was
 * listed once as removed and again as added.
 *
 * Falls back to the whole pair when the differ declines — it bails on inputs
 * too large to diff cheaply, and a long notice still says something true where
 * an empty one would say nothing at all.
 */
function renderDiff(change: EditedProposalChange): string[] {
  const hunks = computeHunks(change.oldText, change.newText);
  if (hunks && hunks.length > 0) {
    return hunks.flatMap((hunk) => hunk.lines);
  }
  return [
    ...change.oldText.split('\n').map((line) => `- ${line}`),
    ...change.newText.split('\n').map((line) => `+ ${line}`),
  ];
}
