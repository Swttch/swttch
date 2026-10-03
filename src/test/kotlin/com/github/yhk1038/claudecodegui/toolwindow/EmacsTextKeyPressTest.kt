package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.awt.event.KeyEvent

/**
 * Guards how [EmacsTextKey.pressOf] reads the letter and the Shift state out of
 * the AWT key event the guard's shortcut action receives (issue #506).
 */
class EmacsTextKeyPressTest {

    /** The fourteen claimed letters with their AWT key code and control character. */
    private val claimed = listOf(
        Triple(KeyEvent.VK_A, 1, "a"), Triple(KeyEvent.VK_B, 2, "b"), Triple(KeyEvent.VK_D, 4, "d"),
        Triple(KeyEvent.VK_E, 5, "e"), Triple(KeyEvent.VK_F, 6, "f"), Triple(KeyEvent.VK_H, 8, "h"),
        Triple(KeyEvent.VK_K, 11, "k"), Triple(KeyEvent.VK_L, 12, "l"), Triple(KeyEvent.VK_N, 14, "n"),
        Triple(KeyEvent.VK_O, 15, "o"), Triple(KeyEvent.VK_P, 16, "p"), Triple(KeyEvent.VK_T, 20, "t"),
        Triple(KeyEvent.VK_V, 22, "v"), Triple(KeyEvent.VK_Y, 25, "y"),
    )

    @Test
    fun `reads each of the fourteen letters from the key code`() {
        for ((code, control, letter) in claimed) {
            assertEquals(
                EmacsTextKey.Press(letter, false),
                EmacsTextKey.pressOf(code, control.toChar(), false),
                "VK ${KeyEvent.getKeyText(code)}",
            )
        }
    }

    @Test
    fun `the key code decides even when the key character is missing`() {
        for ((code, _, letter) in claimed) {
            assertEquals(EmacsTextKey.Press(letter, false), EmacsTextKey.pressOf(code, KeyEvent.CHAR_UNDEFINED, false))
        }
    }

    @Test
    fun `falls back to the control character when the key code is undefined`() {
        // A non-Latin layout or an input method can leave the key code undefined;
        // the control character Ctrl+letter produces still names the letter.
        for ((_, control, letter) in claimed) {
            assertEquals(
                EmacsTextKey.Press(letter, false),
                EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, control.toChar(), false),
                "control character $control",
            )
        }
    }

    @Test
    fun `carries the Shift state as given`() {
        for ((code, control, letter) in claimed) {
            assertEquals(EmacsTextKey.Press(letter, true), EmacsTextKey.pressOf(code, control.toChar(), true))
            assertEquals(
                EmacsTextKey.Press(letter, true),
                EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, control.toChar(), true),
            )
        }
    }

    @Test
    fun `a letter key code outside the fourteen is not rescued by the key character`() {
        for (code in listOf(KeyEvent.VK_C, KeyEvent.VK_G, KeyEvent.VK_J, KeyEvent.VK_Z)) {
            assertNull(EmacsTextKey.pressOf(code, 2.toChar(), false), "VK ${KeyEvent.getKeyText(code)}")
        }
    }

    @Test
    fun `an unclaimed control character with an undefined key code is null`() {
        for (control in listOf(3, 7, 9, 10, 13, 17, 18, 19, 21, 23, 24, 26, 0, 27, 127)) {
            assertNull(EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, control.toChar(), false), "control character $control")
        }
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, KeyEvent.CHAR_UNDEFINED, false))
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, 'b', false), "a printable letter is not a control character")
    }

    @Test
    fun `physical keys that carry a control character are not taken for a letter`() {
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_BACK_SPACE, 8.toChar(), false), "Backspace is not Ctrl+H")
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_DELETE, 127.toChar(), false), "Forward Delete")
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_TAB, 9.toChar(), false), "Tab")
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_ENTER, 10.toChar(), false), "Enter")
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_ESCAPE, 27.toChar(), false), "Escape")
    }
}
