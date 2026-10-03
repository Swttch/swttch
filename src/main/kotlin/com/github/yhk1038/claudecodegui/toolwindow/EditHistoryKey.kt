package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.KeyStroke

/**
 * A text-field history command the webview performs on its focused field.
 * [wire] is the value of `EditHistoryCommand` in the shared TypeScript enum
 * (`backend/src/shared/edit-history-command.ts`).
 */
enum class EditHistoryCommand(val wire: String) {
    UNDO("undo"),
    REDO("redo"),
}

/**
 * Names the Undo/Redo keystrokes the webview claims from the IDE's keymap
 * (issue #495), and the command each one stands for.
 *
 * The IDE's default keymaps bind Undo to Cmd+Z (macOS) / Ctrl+Z (elsewhere)
 * and Redo to Cmd+Shift+Z / Ctrl+Shift+Z, plus Ctrl+Y outside macOS. The key
 * dispatcher runs that action before the keystroke reaches CEF whenever the IDE
 * has an undoable change of its own, so the focused prompt never saw the key
 * and the IDE offered to undo a file move instead.
 *
 * Ctrl+Y is not claimed on macOS: there it is the Emacs "yank" key, which
 * [EmacsTextKey] claims, and Cmd+Y is not Redo in the macOS keymap.
 */
object EditHistoryKey {

    /**
     * The keystrokes claimed while the webview has focus. The primary modifier
     * is Meta on macOS and Ctrl elsewhere.
     */
    fun claimedKeyStrokes(isMac: Boolean): List<KeyStroke> {
        val primary = if (isMac) InputEvent.META_DOWN_MASK else InputEvent.CTRL_DOWN_MASK
        val strokes = mutableListOf(
            KeyStroke.getKeyStroke(KeyEvent.VK_Z, primary),
            KeyStroke.getKeyStroke(KeyEvent.VK_Z, primary or InputEvent.SHIFT_DOWN_MASK),
        )
        if (!isMac) {
            strokes.add(KeyStroke.getKeyStroke(KeyEvent.VK_Y, InputEvent.CTRL_DOWN_MASK))
        }
        return strokes
    }

    /**
     * The command a performed key stands for, or null when it names none.
     * Z is Undo, Shift+Z is Redo, and Y (without Shift) is Redo outside macOS
     * only. Only the claimed keystrokes reach the guard's action, so this is a
     * second fence, not the first.
     */
    fun commandOf(keyCode: Int, shiftDown: Boolean, isMac: Boolean): EditHistoryCommand? = when (keyCode) {
        KeyEvent.VK_Z -> if (shiftDown) EditHistoryCommand.REDO else EditHistoryCommand.UNDO
        KeyEvent.VK_Y -> if (!isMac && !shiftDown) EditHistoryCommand.REDO else null
        else -> null
    }
}
