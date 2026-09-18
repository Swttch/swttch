package com.github.yhk1038.claudecodegui.toolwindow.realization

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class LoadingPhaseTest {

    @Test
    fun `INDEXING_WAIT carries expected key`() {
        assertEquals("phase.indexingWait", LoadingPhase.INDEXING_WAIT.key)
    }

    @Test
    fun `BACKEND_START carries expected key`() {
        assertEquals("phase.backendStart", LoadingPhase.BACKEND_START.key)
    }

    @Test
    fun `LOCATING_NODE carries expected key`() {
        assertEquals("phase.locatingNode", LoadingPhase.LOCATING_NODE.key)
    }

    @Test
    fun `PREPARING_BACKEND carries expected key`() {
        assertEquals("phase.preparingBackend", LoadingPhase.PREPARING_BACKEND.key)
    }

    @Test
    fun `WAITING_FOR_PORT carries expected key`() {
        assertEquals("phase.waitingForPort", LoadingPhase.WAITING_FOR_PORT.key)
    }
}
