/**
 * The text-field history commands the IDE asks a chat tab to perform, as they
 * travel in the payload of `MessageType.EDIT_HISTORY_COMMAND_REQUESTED`.
 *
 * The IDE's keymap binds Undo and Redo (Cmd+Z / Cmd+Shift+Z on macOS, Ctrl+Z /
 * Ctrl+Shift+Z and Ctrl+Y elsewhere) and runs its own action before the
 * keystroke reaches the page whenever the IDE has something to undo, so the
 * focused text field never sees the key (issue #495). The IDE claims the
 * keystroke for the webview, names the command, the backend routes it to the
 * panel, and the webview performs it on the focused field.
 *
 * NOTE: This file is mirrored 1:1 between `backend/src/shared/` and
 * `webview/src/shared/`. Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum EditHistoryCommand {
  /** Revert the last text change in the focused field. */
  Undo = 'undo',
  /** Re-apply the text change the last undo reverted. */
  Redo = 'redo',
}

const EDIT_HISTORY_COMMANDS: ReadonlySet<string> = new Set(Object.values(EditHistoryCommand));

/**
 * The command a payload value names, or null when it names none. Exact match
 * only: no case folding or trimming, because the IDE sends exactly these
 * values and anything else is a malformed message to drop.
 */
export function parseEditHistoryCommand(value: unknown): EditHistoryCommand | null {
  if (typeof value !== 'string') return null;
  return EDIT_HISTORY_COMMANDS.has(value) ? (value as EditHistoryCommand) : null;
}
