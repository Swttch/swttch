/**
 * What the GUI, the IDE and the desktop app write around a typed message, and how it is taken out again.
 *
 * `<system-reminder>` blocks are removed BEFORE a text is tested for anything. The GUI and the desktop app wrap a note
 * around a typed message as a block of its own in the same entry, ahead of the typed text. Calling the whole entry
 * something nobody typed because it opens with that block threw away the typed text with it: in a managed session 16 of
 * 141 prompts were left (#657).
 */
const SYSTEM_REMINDER_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/** The text without its `<system-reminder>` blocks. */
export function withoutSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_BLOCK, '');
}

/**
 * The open file and the selection the IDE put in a message, as the two blocks they are written as.
 *
 * The plugin writes them ahead of what was typed, in the same entry (`injectIdeContext`), so the typed words come
 * after a tag. Testing the entry for a tag at its start left a send made with an open file out of the Up-arrow history
 * and the send index (#719).
 */
const IDE_CONTEXT_BLOCK = /<ide_opened_file>[\s\S]*?<\/ide_opened_file>|<ide_selection>[\s\S]*?<\/ide_selection>/g;

/** The text without the open file and the selection the IDE put in it. */
export function withoutIdeContext(text: string): string {
  return text.replace(IDE_CONTEXT_BLOCK, '');
}
