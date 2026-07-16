package com.github.yhk1038.claudecodegui.bridge

import com.github.yhk1038.claudecodegui.toolwindow.realization.LoadingPhase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class NodeProcessManagerLifecycleTest {

    @Test
    fun `freshly created manager is not dead and not alive (STARTING)`() {
        val mgr = NodeProcessManager(CoroutineScope(Dispatchers.Default))
        // The key invariant behind the duplicate-spawn fix: a manager that exists but
        // hasn't finished starting must NOT look dead. ensureStarted only restarts when
        // isDead == true, so this prevents a concurrent second panel from racing a spawn.
        assertFalse(mgr.isDead, "a freshly created (still STARTING) manager must not report dead")
        assertFalse(mgr.isAlive, "no OS process has been spawned yet")
    }

    @Test
    fun `dispose transitions manager to dead`() {
        val mgr = NodeProcessManager(CoroutineScope(Dispatchers.Default))
        mgr.dispose()
        assertTrue(mgr.isDead, "after dispose the manager is dead")
        assertFalse(mgr.isAlive)
    }

    @Test
    fun `start emits LOCATING_NODE as its first progress phase`() {
        // start() emits LOCATING_NODE before any blocking discovery work, so it fires
        // regardless of whether node is actually installed — this is the signal the panel
        // uses to replace the frozen "Starting backend..." line. See issue #97.
        val latch = CountDownLatch(1)
        var firstPhase: LoadingPhase? = null
        val mgr = NodeProcessManager(
            CoroutineScope(Dispatchers.Default),
            onProgress = { phase ->
                if (firstPhase == null) {
                    firstPhase = phase
                    latch.countDown()
                }
            },
        )
        mgr.start()
        assertTrue(latch.await(5, TimeUnit.SECONDS), "start() must emit a progress phase")
        assertEquals(LoadingPhase.LOCATING_NODE, firstPhase)
        mgr.dispose()
    }

    @Test
    fun `recentStderr is null before any backend output`() {
        // The watchdog diagnostics buffer starts empty; recentStderr() must report
        // null (not an empty string) so callers can branch on "no diagnostics". #97.
        val mgr = NodeProcessManager(CoroutineScope(Dispatchers.Default))
        assertNull(mgr.recentStderr(), "no stderr should be collected before start")
        mgr.dispose()
    }

    // ─── Unified restart signal (exit code 75) ──────────────────────────

    @Test
    fun `restart exit code constant matches the backend contract`() {
        // The backend signals "respawn me on the same port" with this exact code
        // (backend/src/config/environment.ts: RESTART_EXIT_CODE = 75). If they drift,
        // the IDE side silently stops respawning on the backend's restart request.
        assertEquals(75, NodeProcessManager.RESTART_EXIT_CODE)
    }

    @Test
    fun `shouldRequestRestart is true only for code 75 on a non-dispose exit`() {
        // The unified restart rule: respawn iff the backend exited with RESTART_EXIT_CODE
        // AND the exit was not an intentional dispose. This is the whole gating policy
        // behind onRestartRequested, kept pure so it is verified without spawning Node.
        assertTrue(
            NodeProcessManager.shouldRequestRestart(75, disposed = false),
            "exit 75 from a live backend must request a restart",
        )
    }

    @Test
    fun `shouldRequestRestart is false when the exit was caused by dispose`() {
        // dispose() destroys the process and sets lifecycle = DEAD up front, so the exit
        // must be suppressed even if the code happened to be 75 — we are killing it on
        // purpose, not honouring a restart request.
        assertFalse(
            NodeProcessManager.shouldRequestRestart(75, disposed = true),
            "a dispose-driven exit must never trigger a respawn",
        )
    }

    @Test
    fun `shouldRequestRestart is false for ordinary exit codes`() {
        // A normal/graceful exit (0) or a SIGTERM exit (128+15 = 143, what destroy()
        // typically yields) is not the restart signal and must not respawn.
        assertFalse(NodeProcessManager.shouldRequestRestart(0, disposed = false))
        assertFalse(NodeProcessManager.shouldRequestRestart(143, disposed = false))
        assertFalse(NodeProcessManager.shouldRequestRestart(1, disposed = false))
    }

    @Test
    fun `isIntentionalExit is true only for a clean self-exit`() {
        // Exit 0 with no dispose = the backend retired on its own (idle shutdown).
        // Only this case stands the RPC reconnect/restart watchdog down — treating
        // it as a crash respawned the backend ~15 s after every idle shutdown,
        // forever (the D2 manual-pass restart loop).
        assertTrue(
            NodeProcessManager.isIntentionalExit(0, disposed = false),
            "a clean self-exit must stand the RPC watchdog down",
        )
    }

    @Test
    fun `isIntentionalExit is false for dispose-driven and crash exits`() {
        // dispose() kills on purpose (and typically yields 143, but even a 0 with the
        // flag set is ours); any non-zero code is a crash and must keep the
        // reconnect→restart recovery path intact.
        assertFalse(NodeProcessManager.isIntentionalExit(0, disposed = true))
        assertFalse(NodeProcessManager.isIntentionalExit(143, disposed = false))
        assertFalse(NodeProcessManager.isIntentionalExit(137, disposed = false))
        assertFalse(NodeProcessManager.isIntentionalExit(75, disposed = false))
        assertFalse(NodeProcessManager.isIntentionalExit(1, disposed = false))
    }
}
