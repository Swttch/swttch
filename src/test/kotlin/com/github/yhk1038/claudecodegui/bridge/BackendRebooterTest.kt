package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicInteger

class BackendRebooterTest {

    /**
     * A rebooter over a simulated port. [clearable] decides whether killing actually frees the
     * port, so tests describe the situation rather than a fixed number of port polls.
     */
    private fun rebooter(
        occupiedBy: String,
        clearable: Boolean = true,
        onKill: (Long) -> Unit = {},
    ): BackendRebooter {
        var gone = occupiedBy.isEmpty()
        return BackendRebooter(
            StaleBackendReclaimer(
                runCommand = { if (gone) "" else occupiedBy },
                killPid = { pid, _ -> onKill(pid); if (clearable) gone = true; true },
                isWindows = false,
                sleep = { },
            )
        )
    }

    @Test
    fun `restarts through the caller's own spawn path`() {
        // The reboot must go through the lambda the owner supplied — this class never spawns.
        val restarts = AtomicInteger(0)
        val outcome = rebooter("").reboot(19836) { restarts.incrementAndGet() }

        assertEquals(BackendRebooter.Outcome.Restarted(emptyList()), outcome)
        assertEquals(1, restarts.get(), "the owner's restart must run exactly once")
    }

    @Test
    fun `clears a stale process before restarting`() {
        val order = mutableListOf<String>()
        val outcome = rebooter("4242", onKill = { order.add("kill:$it") })
            .reboot(19836) { order.add("restart") }

        assertEquals(BackendRebooter.Outcome.Restarted(listOf(4242L)), outcome)
        assertEquals(listOf("kill:4242", "restart"), order, "kill must precede restart")
    }

    @Test
    fun `refuses to restart while a stale process still holds the port`() {
        // Starting anyway would collide over the port — the exact failure we are recovering from.
        val restarts = AtomicInteger(0)
        val outcome = rebooter("4242", clearable = false).reboot(19836) { restarts.incrementAndGet() }

        assertEquals(BackendRebooter.Outcome.CouldNotReclaim(listOf(4242L)), outcome)
        assertEquals(0, restarts.get(), "must NOT restart when the port could not be reclaimed")
    }

    @Test
    fun `reports a restart that threw without claiming success`() {
        val boom = IllegalStateException("spawn failed")
        val outcome = rebooter("").reboot(19836) { throw boom }

        assertEquals(BackendRebooter.Outcome.RestartFailed(boom), outcome)
    }

    @Test
    fun `hasStaleBackend reflects whether anything holds the port`() {
        assertTrue(rebooter("4242").hasStaleBackend(19836))
        assertFalse(rebooter("").hasStaleBackend(19836))
    }
}
