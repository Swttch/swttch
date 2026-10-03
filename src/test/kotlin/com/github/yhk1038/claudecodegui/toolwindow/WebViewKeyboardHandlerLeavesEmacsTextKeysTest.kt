package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.handler.CefKeyboardHandler
import org.cef.handler.CefKeyboardHandler.CefKeyEvent.EventType
import org.cef.misc.BoolRef
import org.cef.misc.EventFlags
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.KeyEvent

/**
 * Pins that [WebViewKeyboardHandler] no longer claims the macOS Emacs text keys
 * (issue #506). Reporting them moved to the shortcut action of
 * [EmacsTextKeyShortcutGuard], which consumes the AWT event before CEF sees it.
 * Claiming them here from the CEF `character` also misfired on a plain Forward
 * Delete, so the CEF path must stay gone.
 *
 * Events are built the way OSR delivers a Ctrl+letter (key code 65, modifiers 0,
 * the control character in `character`) and a Forward Delete.
 */
class WebViewKeyboardHandlerLeavesEmacsTextKeysTest {

    private val handler = WebViewKeyboardHandler()

    private fun event(type: EventType, keyCode: Int, character: Int): CefKeyboardHandler.CefKeyEvent {
        val c = character.toChar()
        return CefKeyboardHandler.CefKeyEvent(type, EventFlags.EVENTFLAG_NONE, keyCode, 0, false, c, c, true)
    }

    @Test
    fun `a Ctrl+letter is neither consumed nor released from the IDE`() {
        for (control in listOf(1, 2, 4, 5, 6, 8, 11, 12, 14, 15, 16, 20, 22, 25)) {
            for (type in listOf(EventType.KEYEVENT_RAWKEYDOWN, EventType.KEYEVENT_CHAR)) {
                val isShortcut = BoolRef(true)
                assertFalse(handler.onPreKeyEvent(null, event(type, KeyEvent.VK_A, control), isShortcut), "$type of $control consumed")
                assertTrue(isShortcut.get(), "$type of control character $control released from the IDE")
            }
        }
    }

    @Test
    fun `a Forward Delete is neither consumed nor released from the IDE`() {
        val isShortcut = BoolRef(true)
        assertFalse(handler.onPreKeyEvent(null, event(EventType.KEYEVENT_RAWKEYDOWN, KeyEvent.VK_DELETE, 127), isShortcut))
        assertTrue(isShortcut.get())
    }
}
