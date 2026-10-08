package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** One restart of a project's backend at a time; a second request while one runs is dropped. */
class RestartGateTest {

    @Test
    fun `the first request for a project may restart`() {
        assertTrue(RestartGate().enter("/proj/a"))
    }

    @Test
    fun `a second request while the first is running is dropped`() {
        val gate = RestartGate()
        gate.enter("/proj/a")

        assertFalse(gate.enter("/proj/a"))
    }

    @Test
    fun `a request may restart again once the running one is over`() {
        val gate = RestartGate()
        gate.enter("/proj/a")
        gate.leave("/proj/a")

        assertTrue(gate.enter("/proj/a"))
    }

    @Test
    fun `another project is not held up by a restart of this one`() {
        val gate = RestartGate()
        gate.enter("/proj/a")

        assertTrue(gate.enter("/proj/b"))
    }
}
