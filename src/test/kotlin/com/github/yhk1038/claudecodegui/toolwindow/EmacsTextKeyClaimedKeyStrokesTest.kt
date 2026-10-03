package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.JPanel
import javax.swing.KeyStroke

/**
 * Guards which AWT keystrokes [EmacsTextKey.claimedKeyStrokes] keeps away from
 * the IDE's keymap (issue #506), the list [EmacsTextKeyShortcutGuard] registers.
 *
 * Each case builds the KEY_PRESSED event AWT delivers for the chord and asks
 * whether its keystroke is in the list, the same lookup the keymap performs.
 */
class EmacsTextKeyClaimedKeyStrokesTest {

    private val source = JPanel()

    private fun pressed(keyCode: Int, modifiers: Int): KeyEvent =
        KeyEvent(source, KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, KeyEvent.CHAR_UNDEFINED)

    private fun claims(isMac: Boolean, event: KeyEvent): Boolean =
        KeyStroke.getKeyStrokeForEvent(event) in EmacsTextKey.claimedKeyStrokes(isMac)

    private val ctrl = InputEvent.CTRL_DOWN_MASK
    private val shift = InputEvent.SHIFT_DOWN_MASK
    private val meta = InputEvent.META_DOWN_MASK
    private val alt = InputEvent.ALT_DOWN_MASK

    private val claimedLetters = listOf(
        KeyEvent.VK_A, KeyEvent.VK_B, KeyEvent.VK_D, KeyEvent.VK_E, KeyEvent.VK_F,
        KeyEvent.VK_H, KeyEvent.VK_K, KeyEvent.VK_L, KeyEvent.VK_N, KeyEvent.VK_O,
        KeyEvent.VK_P, KeyEvent.VK_T, KeyEvent.VK_V, KeyEvent.VK_Y,
    )

    @Test
    fun `claims Ctrl plus each of the 14 letters on macOS`() {
        for (code in claimedLetters) {
            assertTrue(claims(true, pressed(code, ctrl)), "Ctrl+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `claims Ctrl plus Shift plus each letter on macOS`() {
        for (code in claimedLetters) {
            assertTrue(claims(true, pressed(code, ctrl or shift)), "Ctrl+Shift+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `claims exactly those 28 keystrokes`() {
        assertEquals(28, EmacsTextKey.claimedKeyStrokes(true).toSet().size)
    }

    @Test
    fun `leaves Cmd plus letter to the IDE`() {
        for (code in claimedLetters) {
            assertFalse(claims(true, pressed(code, meta)), "Cmd+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `leaves Ctrl plus Cmd plus letter to the IDE`() {
        for (code in claimedLetters) {
            assertFalse(claims(true, pressed(code, ctrl or meta)), "Ctrl+Cmd+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `leaves Ctrl plus Alt plus letter to the IDE`() {
        for (code in claimedLetters) {
            assertFalse(claims(true, pressed(code, ctrl or alt)), "Ctrl+Alt+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `leaves a plain letter alone`() {
        for (code in claimedLetters) {
            assertFalse(claims(true, pressed(code, 0)), KeyEvent.getKeyText(code))
        }
    }

    @Test
    fun `claims nothing outside macOS`() {
        assertTrue(EmacsTextKey.claimedKeyStrokes(false).isEmpty())
        for (code in claimedLetters) {
            assertFalse(claims(false, pressed(code, ctrl)), "Ctrl+${KeyEvent.getKeyText(code)} off macOS")
        }
    }

    @Test
    fun `leaves other Ctrl letters to the IDE`() {
        for (code in listOf(KeyEvent.VK_C, KeyEvent.VK_Z, KeyEvent.VK_X, KeyEvent.VK_J)) {
            assertFalse(claims(true, pressed(code, ctrl)), "Ctrl+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `leaves Ctrl plus non-letter keys to the IDE`() {
        for (code in listOf(KeyEvent.VK_ENTER, KeyEvent.VK_SPACE)) {
            assertFalse(claims(true, pressed(code, ctrl)), "Ctrl+${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `every claimed keystroke names the letter the guard reports`() {
        // The claimed keystrokes and the reported letter come from one table;
        // this pins that a keystroke kept from the IDE is always one the page
        // is told about, with the Shift state of the keystroke.
        for (stroke in EmacsTextKey.claimedKeyStrokes(true)) {
            val shiftDown = stroke.modifiers and shift != 0
            val press = EmacsTextKey.pressOf(stroke.keyCode, KeyEvent.CHAR_UNDEFINED, shiftDown)
            assertEquals(
                EmacsTextKey.Press(KeyEvent.getKeyText(stroke.keyCode).lowercase(), shiftDown),
                press,
                "keyCode=${stroke.keyCode}",
            )
        }
    }
}
