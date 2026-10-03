package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.JPanel
import javax.swing.KeyStroke

/**
 * Guards which Undo/Redo keystrokes [EditHistoryKey] claims from the IDE's
 * keymap and which command each one names (issue #495).
 */
class EditHistoryKeyTest {

    private val meta = InputEvent.META_DOWN_MASK
    private val ctrl = InputEvent.CTRL_DOWN_MASK
    private val shift = InputEvent.SHIFT_DOWN_MASK

    private fun stroke(keyCode: Int, modifiers: Int): KeyStroke = KeyStroke.getKeyStroke(keyCode, modifiers)

    /** The keystroke the IDE's dispatcher derives from a real AWT key press. */
    private fun strokeOfEvent(keyCode: Int, modifiers: Int): KeyStroke =
        KeyStroke.getKeyStrokeForEvent(KeyEvent(JPanel(), KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, KeyEvent.CHAR_UNDEFINED))

    @Test
    fun `macOS claims Cmd+Z and Cmd+Shift+Z only`() {
        assertEquals(
            setOf(stroke(KeyEvent.VK_Z, meta), stroke(KeyEvent.VK_Z, meta or shift)),
            EditHistoryKey.claimedKeyStrokes(true).toSet(),
        )
        assertEquals(2, EditHistoryKey.claimedKeyStrokes(true).size)
    }

    @Test
    fun `other platforms claim Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y`() {
        assertEquals(
            setOf(stroke(KeyEvent.VK_Z, ctrl), stroke(KeyEvent.VK_Z, ctrl or shift), stroke(KeyEvent.VK_Y, ctrl)),
            EditHistoryKey.claimedKeyStrokes(false).toSet(),
        )
        assertEquals(3, EditHistoryKey.claimedKeyStrokes(false).size)
    }

    @Test
    fun `Ctrl+Y is claimed outside macOS only, where it is the Emacs yank key`() {
        assertTrue(stroke(KeyEvent.VK_Y, ctrl) in EditHistoryKey.claimedKeyStrokes(false))
        assertTrue(EditHistoryKey.claimedKeyStrokes(true).none { it.keyCode == KeyEvent.VK_Y })
    }

    @Test
    fun `macOS claims no Ctrl keystroke the Emacs guard owns`() {
        val emacs = EmacsTextKey.claimedKeyStrokes(true).toSet()
        assertTrue(EditHistoryKey.claimedKeyStrokes(true).none { it in emacs })
    }

    @Test
    fun `the claimed keystrokes are the ones a real key press produces`() {
        assertTrue(strokeOfEvent(KeyEvent.VK_Z, meta) in EditHistoryKey.claimedKeyStrokes(true))
        assertTrue(strokeOfEvent(KeyEvent.VK_Z, meta or shift) in EditHistoryKey.claimedKeyStrokes(true))
        assertTrue(strokeOfEvent(KeyEvent.VK_Z, ctrl) in EditHistoryKey.claimedKeyStrokes(false))
        assertTrue(strokeOfEvent(KeyEvent.VK_Y, ctrl) in EditHistoryKey.claimedKeyStrokes(false))
        assertFalse(strokeOfEvent(KeyEvent.VK_Z, ctrl) in EditHistoryKey.claimedKeyStrokes(true), "Ctrl+Z on macOS is not Undo")
    }

    @Test
    fun `Z is undo and Shift+Z is redo on every platform`() {
        for (isMac in listOf(true, false)) {
            assertEquals(EditHistoryCommand.UNDO, EditHistoryKey.commandOf(KeyEvent.VK_Z, false, isMac))
            assertEquals(EditHistoryCommand.REDO, EditHistoryKey.commandOf(KeyEvent.VK_Z, true, isMac))
        }
    }

    @Test
    fun `Y is redo outside macOS only, and never with Shift`() {
        assertEquals(EditHistoryCommand.REDO, EditHistoryKey.commandOf(KeyEvent.VK_Y, false, false))
        assertNull(EditHistoryKey.commandOf(KeyEvent.VK_Y, false, true))
        assertNull(EditHistoryKey.commandOf(KeyEvent.VK_Y, true, false))
    }

    @Test
    fun `every claimed keystroke maps to a command`() {
        for (isMac in listOf(true, false)) {
            for (s in EditHistoryKey.claimedKeyStrokes(isMac)) {
                val shiftDown = s.modifiers and shift != 0
                assertTrue(EditHistoryKey.commandOf(s.keyCode, shiftDown, isMac) != null, "$s on mac=$isMac")
            }
        }
    }

    @Test
    fun `an unknown key names no command`() {
        for (code in listOf(KeyEvent.VK_A, KeyEvent.VK_X, KeyEvent.VK_UNDEFINED, KeyEvent.VK_BACK_SPACE)) {
            assertNull(EditHistoryKey.commandOf(code, false, false))
            assertNull(EditHistoryKey.commandOf(code, true, true))
        }
    }

    @Test
    fun `wire values match the shared TypeScript enum`() {
        assertEquals("undo", EditHistoryCommand.UNDO.wire)
        assertEquals("redo", EditHistoryCommand.REDO.wire)
    }
}
