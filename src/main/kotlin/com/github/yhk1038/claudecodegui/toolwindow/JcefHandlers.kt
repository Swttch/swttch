package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.handler.CefDragHandler

/**
 * The small amount of JCEF glue that [ClaudeCodePanel] would otherwise have to
 * spell out inline.
 *
 * It lives in its own class for one reason: **[ClaudeCodePanel] is a
 * [javax.swing.JPanel], and a JPanel cannot afford to name JCEF types.**
 * Constructing any [java.awt.Component] makes AWT call
 * `Component.isCoalesceEventsOverriden()`, which reflects over
 * `getDeclaredMethods()` and resolves every declared method's parameter and
 * return types — including the private static methods Kotlin generates for
 * lambdas. On Android Studio 2026.2 Canary, where `com.intellij.modules.jcef`
 * fails to resolve and the plugin's class loader has no JCEF at all, any such
 * signature makes the panel throw NoClassDefFoundError from inside the JPanel
 * constructor, before its own `isJcefAvailable()` guard can run (issue #321).
 *
 * Moving the JCEF-typed lambdas here moves their generated signatures onto this
 * class, which is not a Component and so is never reflected over at construction
 * time. Nothing here is touched unless JCEF is present: every call site sits
 * behind the panel's guard.
 */
internal object JcefHandlers {

    /**
     * Register [handler] on [query], adapting a plain `String -> Unit` callback to
     * the JCEF handler signature.
     *
     * The point is where `JBCefJSQuery.Response` gets named. Written inline in the
     * panel, the lambda returning a Response compiles to a static method on the
     * panel whose descriptor names `JBCefJSQuery$Response`. Written here, that
     * descriptor lands on this class instead.
     *
     * The reply is always an empty Response: these queries are one-way
     * notifications from the page (cursor changes, streaming state), and the page
     * does not read the result.
     */
    fun onQuery(query: JBCefJSQuery, handler: (String) -> Unit) {
        query.addHandler { value: String ->
            handler(value)
            JBCefJSQuery.Response(null)
        }
    }

    /**
     * Run [js] in [browser]'s current page.
     *
     * Exists so callers can hand over a plain String and a holder instead of
     * reaching through `browser.cefBrowser` themselves — doing that inside a
     * lambda in the panel would capture a JCEF-typed value and leak it into the
     * generated method's signature.
     */
    fun executeJavaScript(browser: JBCefBrowser, js: String) {
        val cef = browser.cefBrowser
        cef.executeJavaScript(js, cef.url, 0)
    }

    /**
     * Register a file-drop listener on [browser]'s drag handler.
     *
     * CEF asks the embedder about every drag before it does anything of its own
     * (download / navigate / open-in-new-tab). [onFilesDragged] receives the
     * absolute OS paths of a file drag; everything else is ignored.
     *
     * Always answers `false`, letting CEF forward the drag to the page as normal
     * HTML5 events — the paths stashed here are replayed later, on drop. Returning
     * `true` would cancel CEF's handling and the attach would never happen.
     *
     * Here rather than in the panel for the usual reason: the lambda's signature
     * names `CefDragData` and `CefBrowser`.
     */
    fun onFileDrag(browser: JBCefBrowser, onFilesDragged: (List<String>) -> Unit) {
        browser.jbCefClient.addDragHandler(
            CefDragHandler { _, dragData, _ ->
                if (dragData?.isFile == true) {
                    val names = java.util.Vector<String>()
                    dragData.getFileNames(names)
                    if (names.isNotEmpty()) onFilesDragged(names.toList())
                }
                false
            },
            browser.cefBrowser,
        )
    }
}
