package com.github.yhk1038.claudecodegui.toolwindow

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * Keeps listening for a backend's port after the panel has stopped waiting for it (issue #613).
 *
 * The panel waits [ClaudeCodePanel]'s start timeout for the `PORT:` line and then draws the error
 * screen. On a machine where creating a process is slow, the backend can still come up after that
 * and bind its port, leaving a working backend behind an error screen that offers only Retry.
 * Retry then stops that backend and starts over, which waits the same slow start again.
 *
 * This is the question "did a port arrive after all", kept apart from the panel so it can be
 * tested without a window.
 */
object LatePortWatch {

    /**
     * Waits on [awaitPort] and returns the port, or null when no port is coming: the backend failed
     * to start, or a restart replaced the start this call was listening to. The caller keeps the
     * error screen in both cases.
     *
     * A cancellation of the calling coroutine itself is not "no port is coming" and is rethrown.
     * The service cancels the old start's pending port on a restart, and that cancellation arrives
     * here looking the same, so [ensureActive] is what tells the two apart.
     */
    suspend fun await(awaitPort: suspend () -> Int): Int? =
        try {
            awaitPort()
        } catch (e: CancellationException) {
            currentCoroutineContext().ensureActive()
            null
        } catch (e: Exception) {
            null
        }
}
