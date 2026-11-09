/**
 * Whether the text of a prompt slot was written by the CLI rather than typed.
 *
 * Shared by the backend index (what counts as a send) and the webview rail (what
 * is drawn), so the two cannot disagree about it: the rail takes the index for
 * everything before the loaded transcript, and a disagreement shows up as ticks
 * that appear and vanish as the transcript pages in (#657).
 *
 * `<system-reminder>` blocks are removed BEFORE the test, not matched by it. The
 * GUI and the desktop app wrap a note around a typed message as a block of its
 * own in the same entry, ahead of the typed text. Calling the whole entry
 * CLI-authored because it opens with that block threw away the typed text with
 * it: in a managed session 16 of 141 prompts were left (#657). An entry that is
 * ONLY reminders has nothing left and is not a send either.
 *
 * Anchored at the start, and listed by name rather than matching any tag, so a
 * prompt that merely opens with markup the user typed still counts as typed.
 */
const SYSTEM_REMINDER_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

const CLI_AUTHORED_TEXT = new RegExp(
  '^\\s*(?:'
  + '<command-name>|<command-message>|<local-command-stdout>'
  + '|<task-notification>|<ide_opened_file>'
  + '|\\[Request interrupted by user'
  + ')',
);

/** The text without its `<system-reminder>` blocks. */
export function withoutSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_BLOCK, '');
}

/** True when nothing a person typed is left in `text` once the reminders are taken out. */
export function isCliAuthoredText(text: string): boolean {
  const typed = withoutSystemReminders(text);
  return typed.trim() === '' || CLI_AUTHORED_TEXT.test(typed);
}
