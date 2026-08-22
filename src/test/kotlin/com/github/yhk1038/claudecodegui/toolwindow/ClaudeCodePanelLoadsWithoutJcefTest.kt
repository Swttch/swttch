package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * The end-to-end half of the issue #321 guard: actually load [ClaudeCodePanel]
 * through a class loader that has no JCEF, the way Android Studio 2026.2 Canary
 * does, and check that AWT's reflection over its members does not blow up.
 *
 * [ClaudeCodePanelSignatureTest] asserts the same invariant by inspecting member
 * signatures. This one exercises the mechanism itself — `getDeclaredMethods()`
 * resolving every descriptor — so the guard cannot be satisfied by a signature
 * check that happens to look at the wrong set of members.
 *
 * The panel is not instantiated: that would need a live [com.intellij.openapi.project.Project]
 * and the whole platform. What the reporter's stack shows failing is not the
 * panel's own code but the reflection AWT performs on the way into it, and that
 * is reproducible on the class alone.
 */
class ClaudeCodePanelLoadsWithoutJcefTest {

    /**
     * Loads classes from the test classpath, but pretends the JCEF packages do
     * not exist — the shape of a plugin class loader on an IDE where
     * `com.intellij.modules.jcef` failed to resolve.
     *
     * Everything else is delegated to the parent so the panel's other
     * dependencies (platform, Kotlin stdlib) still resolve normally; only JCEF
     * is missing, which is exactly the reporter's situation.
     */
    private class JcefBlindClassLoader(
        parent: ClassLoader,
        private val ownedPrefix: String,
    ) : ClassLoader(parent) {

        override fun loadClass(name: String, resolve: Boolean): Class<*> {
            if (BLOCKED_PACKAGES.any { name.startsWith(it) }) {
                throw ClassNotFoundException("$name (blocked to simulate a runtime without JCEF)")
            }
            // Load the classes under test ourselves so their references resolve
            // through THIS loader; anything else comes from the parent unchanged.
            if (name.startsWith(ownedPrefix)) {
                findLoadedClass(name)?.let { return it }
                val bytes = parent.getResourceAsStream(name.replace('.', '/') + ".class")?.readBytes()
                if (bytes != null) {
                    val defined = defineClass(name, bytes, 0, bytes.size)
                    if (resolve) resolveClass(defined)
                    return defined
                }
            }
            return super.loadClass(name, resolve)
        }

        private companion object {
            val BLOCKED_PACKAGES = listOf("com.intellij.ui.jcef.", "org.cef.")
        }
    }

    @Test
    fun `ClaudeCodePanel members resolve on a runtime without JCEF`() {
        val loader = JcefBlindClassLoader(
            parent = ClaudeCodePanel::class.java.classLoader,
            ownedPrefix = "com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel",
        )

        val panelClass = Class.forName(ClaudeCodePanel::class.java.name, false, loader)
        assertEquals(loader, panelClass.classLoader, "the panel must be loaded by the JCEF-blind loader")

        // This is the call AWT makes from Component.<init> via
        // isCoalesceEventsOverriden(). Before the fix it threw
        // NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery.
        assertNotNull(panelClass.declaredMethods, "declared methods must resolve without JCEF")
        assertNotNull(panelClass.declaredConstructors, "declared constructors must resolve without JCEF")
        assertNotNull(panelClass.declaredFields, "declared fields must resolve without JCEF")
    }

    /**
     * Proves the blind loader really does hide JCEF — otherwise the test above
     * would pass on a classpath where JCEF was present all along, and prove
     * nothing.
     */
    @Test
    fun `the blind loader hides JCEF from the classes it loads`() {
        val loader = JcefBlindClassLoader(
            parent = javaClass.classLoader,
            ownedPrefix = "com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel",
        )
        assertThrows(ClassNotFoundException::class.java) {
            Class.forName("com.intellij.ui.jcef.JBCefJSQuery", false, loader)
        }
        assertThrows(ClassNotFoundException::class.java) {
            Class.forName("org.cef.browser.CefFrame", false, loader)
        }
    }
}
