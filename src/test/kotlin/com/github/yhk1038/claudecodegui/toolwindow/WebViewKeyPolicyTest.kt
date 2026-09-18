package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.misc.EventFlags
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.KeyEvent

/**
 * Which keystrokes reach the chat instead of running an IDE action.
 *
 * The rule is worth a test of its own because the failure it prevents is
 * invisible from the code: the keys below are bound in the IDE's own default
 * keymap, so getting this wrong does not throw — it silently runs a different
 * action and the chat never hears the key (issue #463).
 */
class WebViewKeyPolicyTest {

    private val none = 0
    private val shift = EventFlags.EVENTFLAG_SHIFT_DOWN
    private val ctrl = EventFlags.EVENTFLAG_CONTROL_DOWN
    private val alt = EventFlags.EVENTFLAG_ALT_DOWN
    private val meta = EventFlags.EVENTFLAG_COMMAND_DOWN

    // Windows VK_OEM_COMMA, the code CEF reports for the comma key.
    private val comma = 188

    @Test
    fun `modified Enter belongs to the composer`() {
        // Shift+Enter is OpenInRightSplit and Ctrl+Enter is ViewSource in the
        // IDE's default keymap; both fired while the chat had focus.
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, shift))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, ctrl))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, meta))
        // Released too, because the send and newline keys are user-settable.
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, alt))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, ctrl or shift))
    }

    @Test
    fun `plain Enter is left to the IDE`() {
        // It already reaches the composer. Claiming it would take Enter away from
        // every IDE list and dialog the chat is merely focused in front of.
        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_ENTER, none))
    }

    @Test
    fun `arrows are released only with the macOS text-navigation modifiers`() {
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_LEFT, meta))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_RIGHT, alt))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_UP, meta))
        assertTrue(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_DOWN, alt))

        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_LEFT, none))
        // Ctrl+Arrow stays with the IDE; only Cmd and Option navigate text.
        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_LEFT, ctrl))
    }

    @Test
    fun `comma opens our settings rather than the IDE dialog`() {
        assertTrue(WebViewKeyPolicy.belongsToWebView(comma, meta))
        assertTrue(WebViewKeyPolicy.belongsToWebView(comma, ctrl))
        assertFalse(WebViewKeyPolicy.belongsToWebView(comma, none))
    }

    @Test
    fun `keys with IDE bindings we did not claim stay with the IDE`() {
        // F12 was claimed once and swallowed WebStorm's terminal shortcut for
        // everyone, with no way to turn it off (issue #333).
        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_F12, none))
        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_F12, alt))
        assertFalse(WebViewKeyPolicy.belongsToWebView(KeyEvent.VK_S, meta))
    }
}
