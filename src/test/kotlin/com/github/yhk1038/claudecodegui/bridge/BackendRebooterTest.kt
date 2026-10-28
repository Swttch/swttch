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

    // ── staleKind (issue #613): reboot without asking only for our own abandoned backend ──

    private val ourBackendCmd =
        """"C:\Program Files\nodejs\node.exe" C:\u\sb\system\plugins\claude-code-gui\0.34.9\backend\backend.mjs"""

    private fun rebooterWith(occupiedBy: String, facts: StaleBackendReclaimer.ProcessFacts?): BackendRebooter =
        BackendRebooter(
            StaleBackendReclaimer(
                runCommand = { occupiedBy },
                killPid = { _, _ -> true },
                isWindows = false,
                sleep = { },
                describeProcess = { facts },
            )
        )

    @Test
    fun `staleKind is NONE when nothing holds the port`() {
        assertEquals(BackendRebooter.StaleKind.NONE, rebooterWith("", null).staleKind(19836))
    }

    @Test
    fun `staleKind is ABANDONED for our backend whose owner is gone`() {
        val facts = StaleBackendReclaimer.ProcessFacts(ourBackendCmd, executable = null, parentPid = null)
        assertEquals(BackendRebooter.StaleKind.ABANDONED, rebooterWith("4242", facts).staleKind(19836))
    }

    @Test
    fun `staleKind asks the user when the owner is still alive`() {
        // The same folder open in a second IDE: that backend is somebody's live session.
        val facts = StaleBackendReclaimer.ProcessFacts(ourBackendCmd, executable = null, parentPid = 31337)
        assertEquals(BackendRebooter.StaleKind.NEEDS_USER, rebooterWith("4242", facts).staleKind(19836))
    }

    @Test
    fun `staleKind asks the user when the process cannot be read`() {
        assertEquals(BackendRebooter.StaleKind.NEEDS_USER, rebooterWith("4242", null).staleKind(19836))
    }

    @Test
    fun `staleKind asks the user for a process that is not our backend`() {
        val facts = StaleBackendReclaimer.ProcessFacts("""C:\tools\some-server.exe --port 19836""", executable = null, parentPid = null)
        assertEquals(BackendRebooter.StaleKind.NEEDS_USER, rebooterWith("4242", facts).staleKind(19836))
    }
}
