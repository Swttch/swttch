package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards the second half of the issue #321 fix, in [ClaudeCodeBrowserService.isJcefAvailable].
 *
 * The panel's fallback path only helps if the guard it asks can answer at all.
 * `JBCefApp.isSupported()` reports whether JCEF *works*, which presupposes the
 * JCEF classes are loadable; on Android Studio 2026.2 Canary they are not, so
 * calling it raises NoClassDefFoundError and the guard never returns. Catching
 * LinkageError is what turns "cannot even ask" into "unavailable", which is the
 * answer that leads to JcefUnavailablePanel.
 *
 * The service itself needs a live Project, so rather than construct it these
 * tests pin the decision rule the catch block encodes. The rule is checked
 * against real Throwables — including the two the field has actually produced.
 */
class JcefAvailabilityGuardTest {

    /**
     * Mirrors the catch in [ClaudeCodeBrowserService.isJcefAvailable]: a probe that
     * cannot even be asked counts as "JCEF unavailable", while anything else keeps
     * propagating.
     */
    private fun availabilityOf(probe: () -> Boolean): Boolean =
        try {
            probe()
        } catch (_: LinkageError) {
            false
        }

    @Test
    fun `a missing JCEF class means unavailable, not a crash`() {
        // Issue #321: Android Studio 2026.2 Canary does not resolve
        // com.intellij.modules.jcef, so the plugin class loader has no
        // com.intellij.ui.jcef package at all.
        assertFalse(
            availabilityOf { throw NoClassDefFoundError("com/intellij/ui/jcef/JBCefApp") },
            "a JCEF class the loader cannot see must read as unavailable",
        )
    }

    @Test
    fun `a JCEF runtime mismatch means unavailable, not a crash`() {
        // Issue #295: the classes exist but the runtime's copy disagrees with the
        // platform's, so JBCefApp's constructor calls a method that is not there.
        assertFalse(
            availabilityOf {
                throw NoSuchMethodError("'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'")
            },
            "a JCEF runtime mismatch must read as unavailable",
        )
    }

    @Test
    fun `a working probe is passed through unchanged`() {
        assertTrue(availabilityOf { true })
        assertFalse(availabilityOf { false })
    }

    @Test
    fun `unrelated failures still propagate`() {
        // The catch is deliberately narrow. Swallowing everything would hide real
        // defects behind a fallback panel that says "this IDE has no JCEF", which
        // would send users off installing runtimes they already have.
        assertThrows(IllegalStateException::class.java) {
            availabilityOf { throw IllegalStateException("something else went wrong") }
        }
    }

    @Test
    fun `both failure shapes are LinkageError, which is why one catch covers them`() {
        // Pins the assumption the single catch clause rests on. If a future JDK
        // reparented either of these, the catch would silently stop covering it.
        assertTrue(LinkageError::class.java.isAssignableFrom(NoClassDefFoundError::class.java))
        assertTrue(LinkageError::class.java.isAssignableFrom(NoSuchMethodError::class.java))
    }

    /**
     * The guard must be *reachable* on a JCEF-less runtime, not just correct once
     * entered — a catch block is no help if loading the class that holds it already
     * failed.
     *
     * [ClaudeCodeBrowserService] names JCEF types in several member signatures
     * (BrowserHolder's constructor, createHolder's return type). That is safe here
     * and not in ClaudeCodePanel because this class is not a [java.awt.Component]:
     * nothing reflects over its members on the way in, so those descriptors are
     * only resolved if something actually calls the member. Loading the class —
     * which is what happens before `isJcefAvailable()` can run — must not throw.
     */
    @Test
    fun `the service class itself loads on a runtime without JCEF`() {
        val loader = object : ClassLoader(ClaudeCodeBrowserService::class.java.classLoader) {
            override fun loadClass(name: String, resolve: Boolean): Class<*> {
                if (name.startsWith("com.intellij.ui.jcef.") || name.startsWith("org.cef.")) {
                    throw ClassNotFoundException("$name (blocked to simulate a runtime without JCEF)")
                }
                return super.loadClass(name, resolve)
            }
        }

        // Loading must succeed even though members mention JCEF types...
        val serviceClass = Class.forName(ClaudeCodeBrowserService::class.java.name, false, loader)
        assertTrue(serviceClass.name.endsWith("ClaudeCodeBrowserService"))

        // ...and the blocker must really be blocking, or the check above proves nothing.
        assertThrows(ClassNotFoundException::class.java) {
            Class.forName("com.intellij.ui.jcef.JBCefApp", false, loader)
        }
    }
}
