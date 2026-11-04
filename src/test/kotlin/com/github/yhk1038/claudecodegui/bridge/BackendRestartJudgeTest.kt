package com.github.yhk1038.claudecodegui.bridge

import com.github.yhk1038.claudecodegui.bridge.BackendRestartJudge.Decision
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BackendRestartJudgeTest {

    @Test
    fun `a live native backend that does not answer is never restarted, whatever the failures were`() {
        assertEquals(Decision.KEEP_WAITING, BackendRestartJudge.decide(processAlive = true, processHandleIsTheBackend = true))
    }

    @Test
    fun `an exited backend is restarted`() {
        assertEquals(Decision.RESTART, BackendRestartJudge.decide(processAlive = false, processHandleIsTheBackend = true))
    }

    @Test
    fun `a live wsl handle proves nothing about the backend so the half-open case still restarts`() {
        assertEquals(Decision.RESTART, BackendRestartJudge.decide(processAlive = true, processHandleIsTheBackend = false))
    }
}
