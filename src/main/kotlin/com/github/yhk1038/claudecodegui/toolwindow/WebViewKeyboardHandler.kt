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

        // Return false to allow normal processing.
        return false
    }
}
