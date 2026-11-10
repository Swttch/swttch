package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.browser.CefBrowser
import org.cef.handler.CefKeyboardHandler
import org.cef.handler.CefKeyboardHandlerAdapter
import org.cef.misc.BoolRef

/**
 * Hands the WebView the keystrokes the IDE would otherwise claim first.
 *
 * CEF asks, before dispatching a key, whether the embedder considers it a
 * shortcut. Answering "no" is what stops IntelliJ's action system from running
 * its own binding and lets the key reach the page.
 *
 * Which keys those are lives in [WebViewKeyPolicy]. Note that this path does not
 * go through IntelliJ's action system at all, so a key released here cannot be
 * rebound by the user in Settings → Keymap — which is why the policy releases as
 * little as it can get away with.
 *
 * The macOS Emacs-style text keys (Ctrl+A/B/D/E/F/H/K/L/N/O/P/T/V/Y, issue #506)
 * are deliberately not handled here. They never reach this handler: a shortcut
 * action registered on the browser component ([EmacsTextKeyShortcutGuard]) is
 * performed by the IDE's key dispatcher first and consumes the AWT event, so
 * CEF never sees the key. Reading them here was tried and was wrong twice over:
 * the guard starved it, and the CEF `character` it had to rely on collides with
 * other physical keys (a plain Forward Delete was reported as a Ctrl+letter).
 */
class WebViewKeyboardHandler : CefKeyboardHandlerAdapter() {

    override fun onPreKeyEvent(
        browser: CefBrowser?,
        event: CefKeyboardHandler.CefKeyEvent?,
        is_keyboard_shortcut: BoolRef?
    ): Boolean {
        if (event == null || is_keyboard_shortcut == null) {
            return false
        }

        if (WebViewKeyPolicy.belongsToWebView(event.windows_key_code, event.modifiers)) {
            is_keyboard_shortcut.set(false)
        }

        // WebStorm 263 reports the low byte of a character as its key code, so ě
        // arrives as an Escape and Chromium drops it (#660). Type it ourselves
        // and keep the event from reaching the page a second time.
        val lost = WebViewKeyPolicy.discardedCharacter(
            isCharEvent = event.type == CefKeyboardHandler.CefKeyEvent.EventType.KEYEVENT_CHAR,
            keyCode = event.windows_key_code,
            character = event.character.code
        )
        if (lost != null && browser != null) {
            browser.executeJavaScript(
                "document.execCommand('insertText', false, String.fromCodePoint($lost))",
                browser.url,
                0
            )
            return true
        }

        // Return false to allow normal processing.
        return false
    }
}
