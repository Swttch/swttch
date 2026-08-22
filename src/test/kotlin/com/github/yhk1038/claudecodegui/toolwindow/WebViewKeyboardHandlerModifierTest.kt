package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.handler.CefKeyboardHandler
import org.cef.misc.BoolRef
import org.cef.misc.EventFlags
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.KeyEvent

/**
 * Guards which key combinations [WebViewKeyboardHandler] releases to the webview
 * (issue #337).
 *
 * The handler used to copy CEF's modifier bit values into local constants, and one
 * copy was wrong: ALT was written as 16, which is actually EVENTFLAG_LEFT_MOUSE_BUTTON.
 * A keyboard event never carries that bit, so `isAltDown` was permanently false and
 * Option+Arrow was silently left to the IDE for the whole life of the plugin. The
 * constants are now read from [EventFlags] rather than transcribed, so no value can
 * drift again.
 *
 * These cases feed real CefKeyEvent instances through the real handler, so they fail
 * if the wiring regresses, not just if a constant changes. Mirroring the flag values
 * here would reproduce the original bug inside the test, so [EventFlags] is the source
 * on both sides.
 */
class WebViewKeyboardHandlerModifierTest {

    private val handler = WebViewKeyboardHandler()

    /**
     * Returns whether the handler released this combination to the webview, i.e. told
     * CEF to stop treating it as an IDE shortcut.
     *
     * The two char arguments are the typed characters, which this hook ignores; NUL
     * stands in for "no character produced".
     */
    private fun reachesWebView(keyCode: Int, modifiers: Int): Boolean {
        val noCharacter = '\u0000'
        val event = CefKeyboardHandler.CefKeyEvent(
            CefKeyboardHandler.CefKeyEvent.EventType.KEYEVENT_RAWKEYDOWN,
            modifiers,
            keyCode,
            0,
            false,
            noCharacter,
            noCharacter,
            true,
        )
        // CEF hands the hook a flag that starts out "yes, this is an IDE shortcut";
        // the handler clears it for the combinations the composer needs.
        val isKeyboardShortcut = BoolRef(true)
        handler.onPreKeyEvent(null, event, isKeyboardShortcut)
        return !isKeyboardShortcut.get()
    }

    private val arrowKeys = listOf(
        KeyEvent.VK_LEFT,
        KeyEvent.VK_RIGHT,
        KeyEvent.VK_UP,
        KeyEvent.VK_DOWN,
    )

    @Test
    fun `Option+Arrow reaches the webview so the composer can move by word`() {
        for (key in arrowKeys) {
            assertTrue(
                reachesWebView(key, EventFlags.EVENTFLAG_ALT_DOWN),
                "Option+$key must reach the composer for word-wise caret movement. " +
                    "This failed while ALT was hardcoded as 16 (issue #337).",
            )
        }
    }

    @Test
    fun `Cmd+Arrow reaches the webview`() {
        for (key in arrowKeys) {
            assertTrue(
                reachesWebView(key, EventFlags.EVENTFLAG_COMMAND_DOWN),
                "Cmd+$key must reach the composer for line-start/end movement",
            )
        }
    }

    @Test
    fun `Cmd and Ctrl comma reach the webview instead of opening IDE settings`() {
        val comma = 188 // Windows VK_OEM_COMMA, which is what CEF reports
        assertTrue(reachesWebView(comma, EventFlags.EVENTFLAG_COMMAND_DOWN), "Cmd+, opens our settings")
        assertTrue(reachesWebView(comma, EventFlags.EVENTFLAG_CONTROL_DOWN), "Ctrl+, opens our settings")
    }

    /**
     * The handler must claim only the combinations it forwards. A bare arrow is
     * ordinary typing and a bare F12 belongs to the IDE (issue #333).
     */
    @Test
    fun `unmodified keys are left to the IDE`() {
        for (key in arrowKeys) {
            assertFalse(
                reachesWebView(key, EventFlags.EVENTFLAG_NONE),
                "A bare arrow key must not be claimed as a webview shortcut",
            )
        }
        assertFalse(reachesWebView(123, EventFlags.EVENTFLAG_NONE), "F12 belongs to the IDE (issue #333)")
        assertFalse(reachesWebView(123, EventFlags.EVENTFLAG_ALT_DOWN), "Alt+F12 belongs to the IDE (issue #333)")
    }

    /**
     * The mouse-button bit is what ALT was mistakenly set to. Pinning it keeps a future
     * edit from reintroducing the same confusion, and documents why 16 was wrong.
     */
    @Test
    fun `the value ALT was mistakenly given belongs to a mouse button`() {
        assertTrue(
            EventFlags.EVENTFLAG_ALT_DOWN != EventFlags.EVENTFLAG_LEFT_MOUSE_BUTTON,
            "ALT and LEFT_MOUSE_BUTTON are different bits",
        )
        assertFalse(
            reachesWebView(KeyEvent.VK_LEFT, EventFlags.EVENTFLAG_LEFT_MOUSE_BUTTON),
            "The left-mouse-button bit must not be read as Option (issue #337)",
        )
    }
}
