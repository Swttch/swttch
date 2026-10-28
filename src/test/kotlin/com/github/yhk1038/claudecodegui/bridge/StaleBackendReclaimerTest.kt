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

    @Test
    fun `netstat parsing matches the port exactly (issue 613)`() {
        // findstr :5939 would also hit :59398, and the wrong pid would be terminated.
        val output = """
              TCP    127.0.0.1:59398        0.0.0.0:0              LISTENING       1111
              TCP    127.0.0.1:5939         0.0.0.0:0              LISTENING       2222
              TCP    [::1]:5939             [::]:0                 LISTENING       3333
              TCP    0.0.0.0:15939          0.0.0.0:0              LISTENING       4444
        """.trimIndent()
        assertEquals("2222\n3333", StaleBackendReclaimer.pidsFromNetstat(output, port = 5939))
    }

    // ── isOurAbandonedBackend (issue #613) ──────────────────────────────────

    private val ourCmd = """node.exe C:\x\plugins\claude-code-gui\0.34.8\backend\backend.mjs"""

    @Test
    fun `our backend with no live parent is abandoned`() {
        assertTrue(StaleBackendReclaimer.isOurAbandonedBackend(ourCmd, executable = null, parentPid = null, selfPid = 10))
    }

    @Test
    fun `our backend reparented to init is abandoned`() {
        assertTrue(StaleBackendReclaimer.isOurAbandonedBackend(ourCmd, executable = null, parentPid = 1, selfPid = 10))
    }

    @Test
    fun `our backend spawned by this IDE is ours to reclaim`() {
        assertTrue(StaleBackendReclaimer.isOurAbandonedBackend(ourCmd, executable = null, parentPid = 10, selfPid = 10))
    }

    @Test
    fun `our backend owned by another live process is left to the user`() {
        assertFalse(StaleBackendReclaimer.isOurAbandonedBackend(ourCmd, executable = null, parentPid = 99, selfPid = 10))
    }

    @Test
    fun `a process that is not our backend is never reclaimed unasked`() {
        assertFalse(StaleBackendReclaimer.isOurAbandonedBackend("""node.exe C:\other\server.js""", null, null, 10))
        assertFalse(StaleBackendReclaimer.isOurAbandonedBackend(null, null, null, 10))
    }

    // Windows gives no command line (measured on Windows 11), only the executable and the parent.

    @Test
    fun `without a command line a node executable with no live owner is ours`() {
        assertTrue(StaleBackendReclaimer.isOurAbandonedBackend(
            null, """C:\Program Files\nodejs\node.exe""", parentPid = null, selfPid = 10,
        ))
    }

    @Test
    fun `without a command line a node executable with a live owner is left to the user`() {
        assertFalse(StaleBackendReclaimer.isOurAbandonedBackend(
            null, """C:\Program Files\nodejs\node.exe""", parentPid = 99, selfPid = 10,
        ))
    }

    @Test
    fun `without a command line a non-node executable is never reclaimed unasked`() {
        assertFalse(StaleBackendReclaimer.isOurAbandonedBackend(
            null, """C:\tools\some-server.exe""", parentPid = null, selfPid = 10,
        ))
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
