import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { EditHistoryCommand, MessageType, parseEditHistoryCommand } from '@/shared';
import { focusedTypingTarget } from '@/utils/focusedTypingTarget';

/** The `document.execCommand` name for each history command. */
const EXEC_COMMAND: Record<EditHistoryCommand, string> = {
  [EditHistoryCommand.Undo]: 'undo',
  [EditHistoryCommand.Redo]: 'redo',
};

/**
 * Undo and Redo for the focused text field when the IDE claims the keystroke
 * (issue #495).
 *
 * Inside the IDE, the keymap binds Undo and Redo (Cmd+Z / Cmd+Shift+Z on macOS,
 * Ctrl+Z / Ctrl+Shift+Z and Ctrl+Y elsewhere) and its key dispatcher runs that
 * action before the keystroke reaches the page whenever the IDE has an
 * undoable change of its own, such as a file moved in the project view. The
 * prompt then never saw the key and the IDE offered to undo the file move.
 * The IDE now claims these keystrokes while the webview has focus and names
 * the command over the bridge (EDIT_HISTORY_COMMAND_REQUESTED); this hook
 * applies it to the focused editable through `document.execCommand`, which
 * walks the same undo stack the browser keeps for that field.
 *
 * The browser keeps that stack only for edits made by the user or through
 * execCommand. Our own text edits (the Emacs keys, the composer's line break
 * and range replacement) go through execCommand for that reason.
 *
 * Undoing in the contentEditable composer fires an `input` event (inputType
 * `historyUndo` / `historyRedo`), which the composer's input handler reads like
 * any other edit, so its state follows the restored text.
 *
 * Outside the IDE nothing sends this message: a plain browser performs the
 * keystrokes natively, and this hook does not listen to the keyboard at all.
 * With no editable focused the command is ignored.
 */
export function useEditHistoryCommands(): void {
  useEffect(() => {
    return getBridge().subscribe(MessageType.EDIT_HISTORY_COMMAND_REQUESTED, (message) => {
      const command = parseEditHistoryCommand(message.payload?.command);
      if (!command) return;

      if (!focusedTypingTarget()) return;

      try {
        document.execCommand(EXEC_COMMAND[command]);
      } catch {
        // A refused command only means the keystroke did nothing.
      }
    });
  }, []);
}
