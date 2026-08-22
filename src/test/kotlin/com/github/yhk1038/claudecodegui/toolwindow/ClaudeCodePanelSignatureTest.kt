package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards the fix for issue #321: [ClaudeCodePanel] must stay constructible on a
 * runtime that has no JCEF at all.
 *
 * Android Studio 2026.2 Canary fails to resolve `com.intellij.modules.jcef`, so
 * this plugin's class loader has neither `com.intellij.ui.jcef` nor `org.cef`.
 * The panel already guarded on `isJcefAvailable()` in its `init` block, but the
 * guard never got to run: constructing any [java.awt.Component] makes AWT call
 * `Component.isCoalesceEventsOverriden()`, which reflects over
 * `getDeclaredMethods()` and resolves every method's parameter and return types.
 * A JCEF type in any member signature therefore throws NoClassDefFoundError from
 * inside the `JPanel` constructor — before `init` runs. That is the reporter's
 * stack, which appears 47 times in their idea.log:
 *
 * ```
 * java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
 *   at java.lang.Class.getDeclaredMethods0(Native Method)
 *   at java.awt.Component.isCoalesceEventsOverriden(Component.java:6316)
 *   at java.awt.Component.<init>(Component.java:6242)
 *   at ...ClaudeCodePanel.<init>(ClaudeCodePanel.kt:95)
 * ```
 *
 * So the invariant is about the shape of the class, not about behaviour:
 * **no JCEF type may appear in any member signature of ClaudeCodePanel.**
 * Method *bodies* are fine — they resolve lazily, and every JCEF-touching body
 * here runs only after the guard has confirmed JCEF is present. Visibility does
 * not help: `getDeclaredMethods()` returns private members too.
 */
class ClaudeCodePanelSignatureTest {

    @Test
    fun `no member signature of ClaudeCodePanel mentions a JCEF type`() {
        val offenders = jcefLeaksInSignatures(ClaudeCodePanel::class.java)
        assertTrue(offenders.isEmpty()) {
            "ClaudeCodePanel must stay constructible without JCEF (issue #321), but these " +
                "members name a JCEF type in their signature, which AWT resolves while the " +
                "JPanel constructor runs:\n" +
                offenders.joinToString("\n") { "  - $it" } +
                "\nReach the JCEF objects through `holder` inside method bodies instead."
        }
    }

    /**
     * Same invariant for anything nested inside the panel. Kotlin lowers `object : ...`
     * into separate class files, and a nested Component that leaked a JCEF type would
     * reproduce the bug in its own constructor.
     */
    @Test
    fun `no member signature of a ClaudeCodePanel nested class mentions a JCEF type`() {
        val offenders = ClaudeCodePanel::class.java.declaredClasses.flatMap { jcefLeaksInSignatures(it) }
        assertTrue(offenders.isEmpty()) {
            "A class nested in ClaudeCodePanel names a JCEF type in a member signature " +
                "(issue #321):\n" + offenders.joinToString("\n") { "  - $it" }
        }
    }

    /**
     * The two panels shown *instead of* the WebView when JCEF is missing or
     * mismatched. These matter most of all: a JCEF type in their signatures would
     * mean the explanation screen dies on exactly the runtimes it exists to
     * explain, leaving the blank window from issue #295 with no message at all.
     */
    @Test
    fun `the JCEF fallback panels do not mention a JCEF type`() {
        val fallbacks = listOf(JcefUnavailablePanel::class.java, JcefRuntimeMismatchPanel::class.java)
        for (panel in fallbacks) {
            val offenders = jcefLeaksInSignatures(panel) +
                panel.declaredClasses.flatMap { jcefLeaksInSignatures(it) }
            assertTrue(offenders.isEmpty()) {
                "${panel.simpleName} is shown when JCEF is unavailable, so it must not name a " +
                    "JCEF type in any member signature:\n" + offenders.joinToString("\n") { "  - $it" }
            }
        }
    }

    /**
     * Proves the detector actually detects — without it, the two tests above would
     * pass just as happily against a panel that still leaked JCEF types.
     *
     * [JcefLeakingSample] is shaped exactly like the pre-fix ClaudeCodePanel: a
     * private accessor returning a JCEF type and a private method taking one.
     */
    @Test
    fun `the detector reports a class that does leak JCEF types`() {
        val offenders = jcefLeaksInSignatures(JcefLeakingSample::class.java)
        assertEquals(2, offenders.size, "expected both leaks to be reported, got: $offenders")
        assertTrue(offenders.any { it.contains("JBCefJSQuery") }, "got: $offenders")
        assertTrue(offenders.any { it.contains("CefFrame") }, "got: $offenders")
    }

    /**
     * Reference specimen for the self-check above: the exact shape issue #321 was
     * caused by. Never instantiated — only its signatures are read.
     */
    @Suppress("unused")
    private class JcefLeakingSample {
        private val query: com.intellij.ui.jcef.JBCefJSQuery? get() = null
        private fun inject(frame: org.cef.browser.CefFrame) = frame.url
    }

    private companion object {

        /**
         * JCEF reaches plugins through two separate platform modules, and Android
         * Studio Canary hands neither to our class loader:
         *  - `com.intellij.ui.jcef` — the platform wrapper (JBCefBrowser, JBCefJSQuery)
         *  - `org.cef` — the JCEF library itself (CefFrame, CefBrowser, handlers)
         * Both must stay out of member signatures.
         */
        val JCEF_PACKAGES = listOf("com.intellij.ui.jcef.", "org.cef.")

        /**
         * Every declared field, method and constructor of [clazz] whose signature
         * names a JCEF type — the same set AWT walks in isCoalesceEventsOverriden().
         *
         * Reflection is safe to use here: the test JVM does have JCEF on its
         * classpath, so nothing fails to resolve. What is asserted is the shape of
         * the signatures, not whether this JVM can load them.
         */
        fun jcefLeaksInSignatures(clazz: Class<*>): List<String> = buildList {
            for (field in clazz.declaredFields) {
                if (isJcef(field.type)) add("field ${field.name}: ${field.type.name}")
            }
            for (method in clazz.declaredMethods) {
                val bad = (method.parameterTypes.toList() + method.returnType).filter(::isJcef)
                if (bad.isNotEmpty()) add("method ${method.name} names ${bad.joinToString { it.name }}")
            }
            for (ctor in clazz.declaredConstructors) {
                val bad = ctor.parameterTypes.filter(::isJcef)
                if (bad.isNotEmpty()) add("constructor names ${bad.joinToString { it.name }}")
            }
        }

        /** True when [type] — or, for arrays, its element type — is a JCEF class. */
        fun isJcef(type: Class<*>): Boolean {
            var t = type
            while (t.isArray) t = t.componentType
            return JCEF_PACKAGES.any { t.name.startsWith(it) }
        }
    }
}
