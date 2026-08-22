package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards the rule that [WebViewKeyboardHandler] claims no F12 (issue #333).
 *
 * It used to open the JCEF DevTools on F12. A CEF keyboard handler sits below
 * IntelliJ's action system, so the chat swallowed every F12 the IDE had bound —
 * WebStorm's Alt+F12 (Terminal tool window) among them — and no IDE setting or
 * registry key could give it back. DevTools now open from the settings screen
 * instead, which needs no key at all.
 *
 * Asserted structurally rather than by feeding key events: the class deliberately
 * does not override `onKeyEvent`, and CefKeyboardHandlerAdapter's inherited
 * version returns false for everything. Constructing a CefKeyEvent to prove that
 * would test the CEF adapter, not us. What must not regress is the *absence* of
 * the override, so that is what this checks — re-adding one fails here.
 */
class WebViewKeyboardHandlerNoF12Test {

    @Test
    fun `does not override onKeyEvent, so no key is consumed for DevTools`() {
        val overridden = WebViewKeyboardHandler::class.java
            .declaredMethods
            .any { it.name == "onKeyEvent" }

        assertFalse(
            overridden,
            "WebViewKeyboardHandler must not override onKeyEvent: that is where the F12 " +
                "DevTools binding lived, and re-adding it re-breaks the IDE's own F12 " +
                "shortcuts (issue #333). Open DevTools from the settings screen instead.",
        )
    }

    /**
     * The pre-key hook may stay — it is what keeps Cmd+Arrow and Cmd+, reaching the
     * webview — but it must never mention F12, whose key code is 123.
     */
    @Test
    fun `declares no F12 key code anywhere`() {
        val hasF12Constant = WebViewKeyboardHandler::class.java.declaredFields
            .any { it.name.contains("F12", ignoreCase = true) }

        assertFalse(hasF12Constant, "No F12 constant should remain on the handler (issue #333)")
    }

    /** The handler still exists for the shortcuts it does forward. */
    @Test
    fun `still handles pre-key events for the shortcuts it forwards`() {
        val handlesPreKey = WebViewKeyboardHandler::class.java
            .declaredMethods
            .any { it.name == "onPreKeyEvent" }

        assertTrue(handlesPreKey, "onPreKeyEvent carries Cmd+Arrow / Cmd+, through to the webview")
    }
}
