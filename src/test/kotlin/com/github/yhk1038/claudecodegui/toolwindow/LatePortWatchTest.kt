package com.github.yhk1038.claudecodegui.toolwindow

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LatePortWatchTest {

    @Test
    fun `returns the port that arrives after the panel stopped waiting`() = runBlocking {
        val port = CompletableDeferred<Int>()
        val watch = async(start = CoroutineStart.UNDISPATCHED) { LatePortWatch.await { port.await() } }

        port.complete(51508)

        assertEquals(51508, watch.await())
    }

    @Test
    fun `returns null when the backend failed instead of coming up`() = runBlocking {
        val port = CompletableDeferred<Int>()
        val watch = async(start = CoroutineStart.UNDISPATCHED) { LatePortWatch.await { port.await() } }

        port.completeExceptionally(IllegalStateException("exited before it came up"))

        assertNull(watch.await())
    }

    @Test
    fun `returns null when a restart cancelled the start it was listening to`() = runBlocking {
        // The service cancels the old start's pending port on a restart. That must end the watch
        // quietly, because the restart brings its own wait.
        val port = CompletableDeferred<Int>()
        val watch = async(start = CoroutineStart.UNDISPATCHED) { LatePortWatch.await { port.await() } }

        port.cancel(CancellationException("Backend restarting"))

        assertNull(watch.await())
    }

    @Test
    fun `lets the cancellation of the watching coroutine itself through`() = runBlocking {
        // Closing the panel cancels the watch. Swallowing that as "no port" would keep the
        // coroutine running after its owner is gone.
        val never = CompletableDeferred<Int>()
        val watch = async(start = CoroutineStart.UNDISPATCHED) { LatePortWatch.await { never.await() } }

        watch.cancel()

        val outcome = runCatching { watch.await() }
        assertTrue(outcome.exceptionOrNull() is CancellationException, "the panel's own cancellation must not turn into null")
    }
}
