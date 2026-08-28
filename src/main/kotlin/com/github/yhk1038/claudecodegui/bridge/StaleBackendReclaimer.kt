package com.github.yhk1038.claudecodegui.bridge

import com.intellij.openapi.diagnostic.Logger
import java.util.concurrent.TimeUnit

/**
 * Finds and terminates a **leftover backend process** that no live [NodeProcessManager] owns,
 * then confirms it is really gone (issue #308).
 *
 * ## Why this exists separately from `BackendInstance.stop()`
 *
 * `stop()` disposes the process handle *this* IDE session spawned. A backend from a previous
 * generation — an earlier plugin version, a crashed IDE, a run that outlived its parent — is not
 * reachable through any handle we hold, so nothing in the normal restart path can clear it. On
 * Windows that leftover process keeps `backend.mjs` and the extractor's `.lock` open, which is
 * what forced reporters to reboot the machine to recover.
 *
 * ## Why this lives in Kotlin rather than reusing backend/src/core/port-utils.ts
 *
 * The backend owns the equivalent logic for its own restarts, but it can only run it while it is
 * up. The case this class exists for is precisely the one where the backend never started, so the
 * cleanup has to happen in the process that launches it. This is bootstrap-layer code, not a
 * second implementation of a backend responsibility.
 *
 * ## Ownership
 *
 * This class only reclaims; it never spawns. Restarting is the job of whoever spawned the backend
 * in the first place — the IDE for a JetBrains panel, the `ccg` launcher for a terminal session —
 * so callers pair [reclaim] with their own start path. See [BackendRebooter].
 */
class StaleBackendReclaimer(
    /** Runs a command and returns stdout, or null when it fails / finds nothing. */
    private val runCommand: (List<String>) -> String? = ::defaultRunCommand,
    /** Sends a termination signal to a pid. Returns false when the kill itself failed. */
    private val killPid: (Long, Boolean) -> Boolean = ::defaultKillPid,
    /** True on Windows. Injectable so the parsing paths are testable on any host. */
    private val isWindows: Boolean = System.getProperty("os.name").startsWith("Windows", true),
    /** Wall-clock sleep between "is it gone yet" polls. Injectable for tests. */
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    private val logger = Logger.getInstance(StaleBackendReclaimer::class.java)

    /** Outcome of a reclaim attempt, so callers can decide whether restarting is safe. */
    sealed interface Result {
        /** Nothing was holding the port — a restart can proceed immediately. */
        object NothingToReclaim : Result

        /** Every stale pid is confirmed gone. [pids] is what was terminated. */
        data class Reclaimed(val pids: List<Long>) : Result

        /**
         * At least one pid survived termination. A restart MUST NOT proceed: the survivor still
         * owns the port and the new process would collide with it.
         */
        data class Failed(val survivingPids: List<Long>) : Result
    }

    /**
     * Terminate whatever is LISTENING on [port] and confirm it is gone.
     *
     * Kills gracefully first, then forcefully, and re-checks the port between phases — the check
     * is the point of this method, since a restart issued before the old process actually exits
     * just reproduces the original failure on a different port.
     */
    fun reclaim(port: Int, selfPid: Long = ProcessHandle.current().pid()): Result {
        val stale = listeningPids(port, selfPid)
        if (stale.isEmpty()) return Result.NothingToReclaim

        logger.info("Reclaiming port $port from stale backend pids=$stale")
        for (pid in stale) killPid(pid, false)
        if (waitUntilPortIsFree(port, selfPid, GRACEFUL_WAIT_MS)) {
            return Result.Reclaimed(stale)
        }

        logger.warn("Stale backend on port $port did not exit gracefully; forcing")
        for (pid in stale) killPid(pid, true)
        if (waitUntilPortIsFree(port, selfPid, FORCED_WAIT_MS)) {
            return Result.Reclaimed(stale)
        }

        val survivors = listeningPids(port, selfPid)
        // warn, not error: the caller handles this outcome (it declines to restart and tells the
        // user), so it is a reported condition rather than an internal fault.
        logger.warn("Could not reclaim port $port; surviving pids=$survivors")
        return Result.Failed(survivors)
    }

    /** True once nothing but us is listening on [port], polled until [timeoutMs] elapses. */
    private fun waitUntilPortIsFree(port: Int, selfPid: Long, timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (true) {
            if (listeningPids(port, selfPid).isEmpty()) return true
            if (System.currentTimeMillis() >= deadline) return false
            sleep(POLL_INTERVAL_MS)
        }
    }

    /**
     * PIDs **listening** on [port], excluding [selfPid].
     *
     * The LISTEN restriction is not a detail. A bare `lsof -ti :PORT` also returns processes
     * merely *connected* to the port — including this IDE's own JVM, which holds an RPC
     * WebSocket to the backend. Killing those pids takes the whole IDE down with exit 137; that
     * regression already happened once (PR #67) and this is the same trap.
     */
    fun listeningPids(port: Int, selfPid: Long = ProcessHandle.current().pid()): List<Long> {
        val raw = if (isWindows) {
            runCommand(listOf("cmd", "/c", "netstat -ano | findstr :$port | findstr LISTENING"))
                ?.let(::pidsFromNetstat)
        } else {
            runCommand(listOf("lsof", "-ti", ":$port", "-sTCP:LISTEN"))
        }
        return selectKillablePids(raw ?: "", selfPid)
    }

    companion object {
        private const val GRACEFUL_WAIT_MS = 2_500L
        private const val FORCED_WAIT_MS = 3_000L
        private const val POLL_INTERVAL_MS = 100L
        private const val COMMAND_TIMEOUT_SECONDS = 10L

        /**
         * Parse the PID column out of `netstat -ano` rows (the last whitespace-separated field),
         * yielding one pid per line for [selectKillablePids].
         */
        fun pidsFromNetstat(output: String): String =
            output.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .mapNotNull { line -> line.split(Regex("\\s+")).lastOrNull() }
                .joinToString("\n")

        /**
         * Valid, de-duplicated, positive pids from raw command output, excluding [selfPid].
         *
         * Mirrors `selectKillablePids` in `backend/src/core/port-utils.ts`, which guards the same
         * hazard on the backend's own restart path. Second line of defence: even if a merely
         * *connected* pid slipped past the LISTEN filter, our own pid never survives this.
         */
        fun selectKillablePids(rawPids: String, selfPid: Long): List<Long> {
            val seen = LinkedHashSet<Long>()
            for (line in rawPids.split('\n')) {
                val pid = line.trim().toLongOrNull() ?: continue
                if (pid <= 0 || pid == selfPid) continue
                seen.add(pid)
            }
            return seen.toList()
        }

        private fun defaultRunCommand(command: List<String>): String? = try {
            val proc = ProcessBuilder(command).redirectErrorStream(false).start()
            val output = proc.inputStream.bufferedReader().readText()
            // lsof / findstr exit non-zero when nothing matches; that is a normal "none found",
            // so the exit code is deliberately not treated as an error here.
            if (!proc.waitFor(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS)) proc.destroyForcibly()
            output
        } catch (e: Exception) {
            // A missing lsof/netstat must not break backend startup — it only means we cannot
            // detect a leftover process, which is exactly the state we were in before this class.
            null
        }

        private fun defaultKillPid(pid: Long, force: Boolean): Boolean = try {
            val handle = ProcessHandle.of(pid).orElse(null)
            when {
                handle == null -> true // already gone
                force -> handle.destroyForcibly()
                else -> handle.destroy()
            }
        } catch (e: Exception) {
            false
        }
    }
}
