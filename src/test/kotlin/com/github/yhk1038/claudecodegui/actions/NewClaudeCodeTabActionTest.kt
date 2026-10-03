package com.github.yhk1038.claudecodegui.actions

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import javax.swing.JPanel

class NewClaudeCodeTabActionTest {

    private val source = JPanel()

    private fun key(modifiers: Int) =
        KeyEvent(source, KeyEvent.KEY_PRESSED, 0L, modifiers, KeyEvent.VK_N, 'n')

    @Test
    fun `mac Ctrl+N yields to the text key`() {
        assertTrue(yieldsToEmacsTextKey(true, key(InputEvent.CTRL_DOWN_MASK)))
    }

    @Test
    fun `mac Cmd+N does not yield`() {
        assertFalse(yieldsToEmacsTextKey(true, key(InputEvent.META_DOWN_MASK)))
    }

    @Test
    fun `mac Ctrl+Meta does not yield`() {
        assertFalse(
            yieldsToEmacsTextKey(true, key(InputEvent.CTRL_DOWN_MASK or InputEvent.META_DOWN_MASK))
        )
    }

    @Test
    fun `non-mac Ctrl+N does not yield`() {
        assertFalse(yieldsToEmacsTextKey(false, key(InputEvent.CTRL_DOWN_MASK)))
    }

    @Test
    fun `mac null input event does not yield`() {
        assertFalse(yieldsToEmacsTextKey(true, null))
    }

    @Test
    fun `mac mouse event does not yield`() {
        val mouse = MouseEvent(
            source, MouseEvent.MOUSE_CLICKED, 0L, InputEvent.CTRL_DOWN_MASK, 0, 0, 1, false
        )
        assertFalse(yieldsToEmacsTextKey(true, mouse))
    }
}
