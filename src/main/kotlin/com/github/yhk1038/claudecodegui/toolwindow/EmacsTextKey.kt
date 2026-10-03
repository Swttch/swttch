package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.KeyStroke

/**
 * Names the macOS Emacs-style text key an AWT key event stands for (issue #506).
 *
 * macOS gives every native text field a set of Ctrl+letter bindings
 * (AppKit's `StandardKeyBinding.dict`): caret moves (A, B, E, F, N, P, V) and
 * edits (D, H, K, L, O, T, Y). Under JCEF off-screen rendering the page
 * receives every Ctrl+letter as Ctrl+A, so the webview cannot tell these keys
 * apart and the IDE has to say which one was pressed.
 *
 * The IDE reads it from the AWT key event, not from CEF. A shortcut action
 * registered on the browser component ([EmacsTextKeyShortcutGuard]) is
 * performed by the IDE's key dispatcher before the keymap is consulted, and
 * performing it consumes the event, so CEF never sees these keys at all. The
 * AWT event that action receives is the reliable one: its `keyCode` is the
 * real letter (`VK_A`..`VK_Z`) and `isShiftDown` is the real Shift state,
 * neither of which the CEF event carries under OSR.
 *
 * When a non-Latin layout or an input method leaves the key code undefined,
 * the key character still names the letter as the ASCII control character
 * Ctrl+letter produces (Ctrl+A is 1 ... Ctrl+Z is 26), so [pressOf] falls back
 * to it.
 *
 * The letters returned are the wire values of `EmacsTextKey` in the shared
 * TypeScript enum (`backend/src/shared/emacs-text-key.ts`).
 */
object EmacsTextKey {

    /** One claimed key press: the lowercase [letter] and whether Shift was held. */
    data class Press(val letter: String, val shift: Boolean)

    /**
     * The single list of claimed letters. The keystrokes the guard registers
     * ([claimedKeyStrokes]) and the letter it reports ([pressOf]) are both
     * derived from it, so the two cannot drift apart.
     */
    private val LETTERS: List<Char> = listOf(
        'a', // Ctrl+A: start of the paragraph
        'b', // Ctrl+B: one character back
        'd', // Ctrl+D: delete the character after the caret
        'e', // Ctrl+E: end of the paragraph
        'f', // Ctrl+F: one character forward
        'h', // Ctrl+H: delete the character before the caret
        'k', // Ctrl+K: cut to the end of the paragraph
        'l', // Ctrl+L: center the caret in the visible area
        'n', // Ctrl+N: one row down
        'o', // Ctrl+O: open a line (insert a line break, caret stays before it)
        'p', // Ctrl+P: one row up
        't', // Ctrl+T: transpose the characters around the caret
        'v', // Ctrl+V: one page down
        'y', // Ctrl+Y: insert the last cut text
    )

    /**
     * AWT key code to letter. `VK_A`..`VK_Z` equal the ASCII codes of
     * 'A'..'Z', so the key code is the uppercase letter itself.
     */
    private val letterByKeyCode: Map<Int, String> =
        LETTERS.associate { it.uppercaseChar().code to it.toString() }

    /** Control character to letter: Ctrl+letter produces letter - 'a' + 1. */
    private val letterByControlCharacter: Map<Int, String> =
        LETTERS.associate { (it - 'a' + 1) to it.toString() }

    /**
     * The AWT keystrokes the guard claims while the webview has focus:
     * Ctrl+letter and Ctrl+Shift+letter for every claimed letter, on macOS
     * only. Empty elsewhere, where Ctrl+B and friends are ordinary IDE
     * shortcuts.
     */
    fun claimedKeyStrokes(isMac: Boolean): List<KeyStroke> {
        if (!isMac) return emptyList()
        val ctrl = InputEvent.CTRL_DOWN_MASK
        val ctrlShift = ctrl or InputEvent.SHIFT_DOWN_MASK
        return letterByKeyCode.keys.flatMap { code ->
            listOf(
                KeyStroke.getKeyStroke(code, ctrl),
                KeyStroke.getKeyStroke(code, ctrlShift),
            )
        }
    }

    /**
     * The claimed press an AWT key event stands for, or null when it names
     * none of the fourteen letters.
     *
     * The letter comes from [keyCode] when it is `VK_A`..`VK_Z`. Only when it
     * is not (a non-Latin layout or an input method can leave it
     * `VK_UNDEFINED`) does [keyChar] decide, and then only as a control
     * character 1..26. A letter key code that is not one of the fourteen
     * (Ctrl+C, say) is null outright rather than second-guessed by the key
     * character.
     *
     * Backspace is the one physical key whose own character (8) is a claimed
     * control character (Ctrl+H's), so its key code never falls back. Only the
     * claimed keystrokes reach the guard's action, so this is a second fence,
     * not the first.
     */
    fun pressOf(keyCode: Int, keyChar: Char, shiftDown: Boolean): Press? {
        val letter = when (keyCode) {
            in KeyEvent.VK_A..KeyEvent.VK_Z -> letterByKeyCode[keyCode]
            KeyEvent.VK_BACK_SPACE -> null
            else -> letterByControlCharacter[keyChar.code]
        } ?: return null
        return Press(letter, shiftDown)
    }
}
