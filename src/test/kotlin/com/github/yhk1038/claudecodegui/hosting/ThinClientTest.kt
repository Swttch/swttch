package com.github.yhk1038.claudecodegui.hosting

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The rule that keeps the JetBrains Client half of Remote Development from
 * starting a second backend on the wrong machine (issue #292).
 *
 * Values come from the client JVM's own `JVM options` log line, so these are
 * the strings the platform actually sets, not invented ones.
 */
class ThinClientTest {

    @Test
    fun `an ordinary IDE sets neither property`() {
        assertFalse(ThinClient.isThinClient(null, null))
    }

    @Test
    fun `the platform prefix alone identifies the client`() {
        assertTrue(ThinClient.isThinClient("JetBrainsClient", null))
    }

    @Test
    fun `the product mode alone identifies the client`() {
        assertTrue(ThinClient.isThinClient(null, "frontend"))
    }

    @Test
    fun `the client sets both, as measured on PhpStorm 2026 dot 2 dot 3`() {
        assertTrue(ThinClient.isThinClient("JetBrainsClient", "frontend"))
    }

    @Test
    fun `a remote dev host is not a thin client`() {
        // The remote half runs the full IDE; its product mode is not `frontend`.
        assertFalse(ThinClient.isThinClient("Idea", "monolith"))
    }

    @Test
    fun `an unrelated product prefix does not trip the rule`() {
        assertFalse(ThinClient.isThinClient("PhpStorm", null))
    }
}
