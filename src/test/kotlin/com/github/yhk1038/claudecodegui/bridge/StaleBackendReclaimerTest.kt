package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class StaleBackendReclaimerTest {

    // ── selectKillablePids: the IDE-survival guard (PR #67 regression) ──────

    @Test
    fun `keeps valid pids in order and de-duplicates`() {
        assertEquals(
            listOf(123L, 456L),
            StaleBackendReclaimer.selectKillablePids("123\n456\n123", selfPid = 999),
        )
    }

    @Test
    fun `never returns our own pid`() {
        // Killing our own pid means killing the IDE JVM — the exit 137 crash from PR #67.
        assertEquals(
            listOf(123L, 456L),
            StaleBackendReclaimer.selectKillablePids("123\n777\n456", selfPid = 777),
        )
    }

    @Test
    fun `drops blanks, non-numeric noise and non-positive pids`() {
        assertEquals(
            listOf(42L),
            StaleBackendReclaimer.selectKillablePids("\n  \nnot-a-pid\n0\n-5\n42\n", selfPid = 1),
        )
    }

    @Test
    fun `empty output yields no pids`() {
        assertTrue(StaleBackendReclaimer.selectKillablePids("", selfPid = 1).isEmpty())
    }

    // ── netstat parsing (Windows) ───────────────────────────────────────────

    @Test
    fun `takes the last column of netstat rows as the pid`() {
        val output = """
              TCP    127.0.0.1:19836        0.0.0.0:0              LISTENING       4242
              TCP    [::1]:19836            [::]:0                 LISTENING       4242
        """.trimIndent()
        assertEquals(listOf(4242L), StaleBackendReclaimer.selectKillablePids(
            StaleBackendReclaimer.pidsFromNetstat(output), selfPid = 1,
        ))
    }

    @Test
    fun `netstat parsing tolerates blank lines`() {
        assertEquals("", StaleBackendReclaimer.pidsFromNetstat("\n   \n"))
    }

    // ── reclaim orchestration ───────────────────────────────────────────────

    /**
     * A reclaimer over a simulated port, driven by *what happened* rather than by call count:
     * [diesOn] says which kill (graceful / forced / never) actually clears the port. Scripting a
     * fixed sequence of port views instead would pin the test to how many times reclaim() polls,
     * which is an implementation detail it must not depend on.
     */
    private enum class DiesOn { GRACEFUL, FORCED, NEVER }

    private class PortSim(val pid: String, val diesOn: DiesOn) {
        val killed = mutableListOf<Pair<Long, Boolean>>()
        private var gone = false

        fun view(): String = if (gone) "" else pid

        fun kill(pid: Long, force: Boolean) {
            killed.add(pid to force)
            if (diesOn == DiesOn.GRACEFUL || (diesOn == DiesOn.FORCED && force)) gone = true
        }
    }

    private fun reclaimerOver(sim: PortSim) = StaleBackendReclaimer(
        runCommand = { sim.view() },
        killPid = { pid, force -> sim.kill(pid, force); true },
        isWindows = false,
        sleep = { /* no real waiting in tests */ },
    )

    @Test
    fun `reports nothing to reclaim when the port is free`() {
        val reclaimer = StaleBackendReclaimer(
            runCommand = { "" },
            killPid = { _, _ -> fail("nothing should be killed") },
            isWindows = false,
            sleep = { },
        )
        assertEquals(StaleBackendReclaimer.Result.NothingToReclaim, reclaimer.reclaim(19836, selfPid = 1))
    }

    @Test
    fun `terminates a stale pid gracefully and confirms it is gone`() {
        val sim = PortSim("4242", DiesOn.GRACEFUL)
        val result = reclaimerOver(sim).reclaim(19836, selfPid = 1)

        assertEquals(StaleBackendReclaimer.Result.Reclaimed(listOf(4242L)), result)
        assertEquals(listOf(4242L to false), sim.killed, "should stop at the graceful kill")
    }

    @Test
    fun `escalates to a forced kill when the process survives`() {
        val sim = PortSim("4242", DiesOn.FORCED)
        val result = reclaimerOver(sim).reclaim(19836, selfPid = 1)

        assertEquals(StaleBackendReclaimer.Result.Reclaimed(listOf(4242L)), result)
        assertEquals(
            listOf(4242L to false, 4242L to true), sim.killed,
            "graceful kill first, forced kill only after it fails",
        )
    }

    @Test
    fun `fails when the stale process survives even a forced kill`() {
        // The port never clears — a restart here would collide with the survivor.
        val sim = PortSim("4242", DiesOn.NEVER)
        val result = reclaimerOver(sim).reclaim(19836, selfPid = 1)

        assertEquals(StaleBackendReclaimer.Result.Failed(listOf(4242L)), result)
    }

    @Test
    fun `does not target our own pid even when it holds the port`() {
        val sim = PortSim("777", DiesOn.GRACEFUL)
        val result = reclaimerOver(sim).reclaim(19836, selfPid = 777)

        assertEquals(StaleBackendReclaimer.Result.NothingToReclaim, result)
        assertTrue(sim.killed.isEmpty(), "must never kill the IDE's own process")
    }

    @Test
    fun `treats an unavailable lsof as nothing to reclaim`() {
        // A host without lsof/netstat must not break startup — it only means we cannot detect.
        val reclaimer = StaleBackendReclaimer(
            runCommand = { null },
            killPid = { _, _ -> fail("must not kill anything when detection is unavailable") },
            isWindows = false,
            sleep = { },
        )
        assertEquals(StaleBackendReclaimer.Result.NothingToReclaim, reclaimer.reclaim(19836, selfPid = 1))
    }
}
