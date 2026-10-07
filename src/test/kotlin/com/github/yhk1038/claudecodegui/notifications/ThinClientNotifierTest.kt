package com.github.yhk1038.claudecodegui.notifications

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The once-per-version notice on a JetBrains Client (issue #473). Showing it needs
 * the IDE; what can be pinned here is when it is owed and what it tells a person to do.
 */
class ThinClientNotifierTest {

    @Test
    fun `a client that never saw the notice is owed it`() {
        assertTrue(ThinClientNotifier.isOwed(shownVersion = null, version = "0.33.4"))
    }

    @Test
    fun `a client that saw this version is not told again`() {
        assertFalse(ThinClientNotifier.isOwed(shownVersion = "0.33.4", version = "0.33.4"))
    }

    @Test
    fun `a new version is announced again, because that is when the two halves can drift apart`() {
        assertTrue(ThinClientNotifier.isOwed(shownVersion = "0.33.3", version = "0.33.4"))
    }

    @Test
    fun `the notice names the symptom, the version to match and the restart`() {
        val text = ThinClientNotifier.contentFor("0.33.4")

        assertTrue(text.contains("Backend disconnected"), "the symptom a person is looking at: $text")
        assertTrue(text.contains("remote host to v0.33.4"), "the version to bring the host up to: $text")
        assertTrue(text.contains("restart"), "an updated plugin only loads after a restart: $text")
    }
}
