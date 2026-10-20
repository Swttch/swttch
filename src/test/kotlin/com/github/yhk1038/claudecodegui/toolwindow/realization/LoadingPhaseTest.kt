package com.github.yhk1038.claudecodegui.toolwindow.realization

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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

    @Test
    fun `CHECKING_POWERSHELL carries expected key`() {
        assertEquals("phase.checkingPowerShell", LoadingPhase.CHECKING_POWERSHELL.key)
    }

    @Test
    fun `a PHASE line from the backend names the phase it announces`() {
        assertEquals(LoadingPhase.CHECKING_POWERSHELL, LoadingPhase.fromBackendLine("PHASE:CHECKING_POWERSHELL"))
    }

    @Test
    fun `a PHASE line is read through trailing whitespace`() {
        assertEquals(LoadingPhase.CHECKING_POWERSHELL, LoadingPhase.fromBackendLine("PHASE:CHECKING_POWERSHELL \r"))
    }

    @Test
    fun `a PHASE line naming a phase this plugin lacks is ignored`() {
        assertNull(LoadingPhase.fromBackendLine("PHASE:SOMETHING_NEWER"))
    }

    @Test
    fun `a line that is not a PHASE line is ignored`() {
        assertNull(LoadingPhase.fromBackendLine("PORT:1234"))
        assertNull(LoadingPhase.fromBackendLine("[node-backend] starting"))
    }
}
