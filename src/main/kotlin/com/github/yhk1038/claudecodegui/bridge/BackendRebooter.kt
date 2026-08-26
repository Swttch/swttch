package com.github.yhk1038.claudecodegui.bridge

import com.intellij.openapi.diagnostic.Logger

/**
 * Reusable "clean up whatever is stuck, then bring the backend back" operation (issue #308).
 *
 * ## The two rules this type exists to enforce
 *
 * **1. Whoever spawned the backend restarts it.** The IDE restarts a backend the IDE spawned; the
 * `ccg` launcher restarts one a terminal spawned. A caller supplies its own [restart] lambda
 * rather than this class reaching for a spawn path, because a backend restarted by someone other
 * than its owner has no one responsible for its lifetime — the shutdown rule is host ownership,
 * and a reboot must not quietly transfer it.
 *
 * **2. Kill, *confirm*, then start.** Starting before the previous process is confirmed gone just
 * collides with it over the port and reproduces the failure. [StaleBackendReclaimer.reclaim]
 * verifies the port is free, and [reboot] refuses to restart when it cannot.
 *
 * ## Deliberately not included: when to offer this
 *
 * Detecting a leftover backend and putting a button on screen are the *caller's* concern. Those
 * are the trigger conditions of one particular case (#308); binding them in here would make this
 * unusable for the next caller, which will have its own reason to reboot a backend.
 */
class BackendRebooter(
    private val reclaimer: StaleBackendReclaimer = StaleBackendReclaimer(),
) {
    private val logger = Logger.getInstance(BackendRebooter::class.java)

    /** What a reboot attempt did, so a caller can tell the user something specific. */
    sealed interface Outcome {
        /** The backend was restarted. [reclaimedPids] is empty when nothing needed clearing. */
        data class Restarted(val reclaimedPids: List<Long>) : Outcome

        /**
         * A stale process could not be terminated, so no restart was attempted. Restarting anyway
         * would collide with [survivingPids] over the port.
         */
        data class CouldNotReclaim(val survivingPids: List<Long>) : Outcome

        /** Reclaim succeeded but the caller's own restart threw. */
        data class RestartFailed(val cause: Throwable) : Outcome
    }

    /**
     * Clear anything stale holding [port], then hand control back to [restart] — the spawn path
     * belonging to whoever owns this backend.
     *
     * [restart] is invoked at most once, and only after the port is confirmed free.
     */
    fun reboot(port: Int, restart: () -> Unit): Outcome {
        val reclaimed = when (val result = reclaimer.reclaim(port)) {
            is StaleBackendReclaimer.Result.Failed -> {
                logger.warn("Not restarting the backend: port $port still held by ${result.survivingPids}")
                return Outcome.CouldNotReclaim(result.survivingPids)
            }
            is StaleBackendReclaimer.Result.Reclaimed -> result.pids
            StaleBackendReclaimer.Result.NothingToReclaim -> emptyList()
        }

        return try {
            restart()
            logger.info("Backend rebooted on port $port (reclaimed=$reclaimed)")
            Outcome.Restarted(reclaimed)
        } catch (e: Exception) {
            // warn, not error: this is returned to the caller as an Outcome to act on.
            logger.warn("Backend restart threw after reclaiming port $port", e)
            Outcome.RestartFailed(e)
        }
    }

    /**
     * True when something is listening on [port] that this IDE session does not own — the
     * condition a caller can use to decide whether to offer a reboot.
     *
     * Kept separate from [reboot] so callers choose their own trigger.
     */
    fun hasStaleBackend(port: Int): Boolean = reclaimer.listeningPids(port).isNotEmpty()
}
