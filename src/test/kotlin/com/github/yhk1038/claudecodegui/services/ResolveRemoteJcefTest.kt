package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Unit tests for [resolveRemoteJcef], which decides whether JCEF is running in
 * out-of-process ("remote") mode so the browser holder can avoid forcing
 * windowed (non-OSR) rendering.
 *
 * Regression guard for issue #79: PyCharm 2026.1.3 RC2 (and every 2025.1+
 * build) runs JCEF out-of-process by default, but does NOT signal it via the
 * `jcef.remote.enabled` system property — JBCefApp itself detects remote mode
 * by reflectively calling `CefApp.isRemoteEnabled()`. The old code keyed off the
 * system property alone, mis-detected remote builds as in-process, forced
 * `setOffScreenRendering(false)`, and remote mode rejected windowed rendering
 * (IJPL-184288) → blank panel.
 *
 * The rule: either signal claiming remote is enough. Treating the CefApp answer
 * as authoritative was wrong — `isRemoteEnabled()` just reads a static field
 * JCEF populates during its own startup, so asking before that (i.e. while
 * building our first browser) returns `false` on a genuinely remote IDE. That is
 * what regressed the OSR ghost fix from #171 on 2026.2: `remote=false` skipped
 * installing the repaint nudge while the platform rendered OSR anyway.
 */
class ResolveRemoteJcefTest {

    @Test
    fun `trusts CefApp when it reports remote enabled`() {
        assertTrue(resolveRemoteJcef(cefRemoteEnabled = true, legacySystemProperty = null))
    }

    @Test
    fun `treats a lone negative CefApp answer as not remote`() {
        assertFalse(resolveRemoteJcef(cefRemoteEnabled = false, legacySystemProperty = null))
    }

    @Test
    fun `believes the property when CefApp has not initialised yet`() {
        // Measured on IntelliJ 2026.2.1: the platform sets jcef.remote.enabled=true
        // and logs "Trying to create windowed browser when remote-mode is enabled",
        // yet CefApp.isRemoteEnabled() still answers false because its static flag
        // is not set until JCEF starts. Believing CefApp here left the browser
        // marked non-OSR and dropped the #171 ghost-repaint nudge.
        assertTrue(resolveRemoteJcef(cefRemoteEnabled = false, legacySystemProperty = "true"))
    }

    @Test
    fun `falls back to the system property when CefApp cannot be queried`() {
        assertTrue(resolveRemoteJcef(cefRemoteEnabled = null, legacySystemProperty = "true"))
    }

    @Test
    fun `fallback treats a missing property as not remote`() {
        assertFalse(resolveRemoteJcef(cefRemoteEnabled = null, legacySystemProperty = null))
    }

    @Test
    fun `fallback treats a non-true property as not remote`() {
        assertFalse(resolveRemoteJcef(cefRemoteEnabled = null, legacySystemProperty = "false"))
    }
}
