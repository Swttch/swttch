package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.toolwindow.ConnectionRecovery.Action
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ConnectionRecoveryTest {

    private fun decide(
        backendRunning: Boolean = true,
        port: Int? = 41234,
        restarting: Boolean = false,
        loadInFlight: Boolean = false,
        backendAnswering: Boolean = true,
    ) = ConnectionRecovery.decide(backendRunning, port, restarting, loadInFlight, backendAnswering)

    @Test
    fun `a page cut off from a backend the widget shows as running is loaded again`() {
        assertEquals(Action.LOAD_AGAIN, decide())
    }

    @Test
    fun `a backend that is not running is left to the crash and exit recovery`() {
        assertEquals(Action.NOTHING, decide(backendRunning = false))
    }

    @Test
    fun `a backend without a port has nothing to load from`() {
        assertEquals(Action.NOTHING, decide(port = null))
    }

    @Test
    fun `a restart under way loads the page itself when it ends`() {
        assertEquals(Action.NOTHING, decide(restarting = true))
    }

    @Test
    fun `a page already being loaded is not loaded again on top of itself`() {
        assertEquals(Action.NOTHING, decide(loadInFlight = true))
    }

    @Test
    fun `a running backend that does not answer the IDE yet is asked about again later, not loaded`() {
        assertEquals(Action.ASK_AGAIN_LATER, decide(backendAnswering = false))
    }

    @Test
    fun `a backend that is not running is not asked about again even when it does not answer`() {
        assertEquals(Action.NOTHING, decide(backendRunning = false, backendAnswering = false))
    }

    @Test
    fun `the page retries a failed load at its own reconnect interval`() {
        assertEquals(2_000L, PageRetry.INTERVAL_MS)
    }
}
