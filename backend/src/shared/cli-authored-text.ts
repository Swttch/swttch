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
  + '|<task-notification>|<ide_opened_file>|<side-sessions-event>'
  + '|\\[Request interrupted by user'
  + ')',
);

/** The text without its `<system-reminder>` blocks. */
export function withoutSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_BLOCK, '');
}

/**
 * The open file and the selection the IDE put in a message, as the two blocks they are written as.
 *
 * The plugin writes them ahead of what was typed, in the same entry (`injectIdeContext`), so the typed words come
 * after a tag.
 */
const IDE_CONTEXT_BLOCK = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>|<ide_selection>[\s\S]*?<\/ide_selection>/g;

/** The text without the open file and the selection the IDE put in it. */
export function withoutIdeContext(text: string): string {
  return text.replace(IDE_CONTEXT_BLOCK, '');
}

/**
 * True when nothing a person typed is left in `text` once the reminders and the IDE context are taken out.
 *
 * The IDE context goes the way the reminders do, and for the same reason: it rides in the same entry as what was
 * typed, so testing the entry for a tag at its start called a send made with an open file CLI-authored. Such a send
 * was left out of the Up-arrow history and got no tick on the rail (#719). `<ide_selection>` was not on the list of
 * tags, so a send that opens with it was never wrongly caught. An entry that is only IDE context has nothing typed
 * left, so it is still not a send.
 */
export function isCliAuthoredText(text: string): boolean {
  const typed = withoutIdeContext(withoutSystemReminders(text));
  return typed.trim() === '' || CLI_AUTHORED_TEXT.test(typed);
}

/**
 * Whether the text is the desktop app's note about sessions this one started
 * (`<side-sessions-event>`, with a `<system-reminder>` per session ahead of it).
 *
 * The app writes it as an ordinary `user` entry so Claude sees it, which makes
 * it look like a send. It is not one: nobody typed it, and it must neither pin
 * a header at the top of the chat nor get a tick on the rail.
 */
export function isSideSessionsEventText(text: string): boolean {
  return /^\s*<side-sessions-event>/.test(withoutSystemReminders(text));
}
