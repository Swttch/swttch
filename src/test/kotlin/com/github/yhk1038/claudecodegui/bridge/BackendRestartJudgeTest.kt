package com.github.yhk1038.claudecodegui.bridge

import com.github.yhk1038.claudecodegui.bridge.BackendRestartJudge.Decision
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.net.ConnectException
import java.net.http.HttpConnectTimeoutException
import java.net.http.HttpTimeoutException
import java.util.concurrent.CompletionException

class BackendRestartJudgeTest {

    @Test
    fun `a live native backend that only timed out is never restarted`() {
        assertEquals(Decision.KEEP_WAITING, BackendRestartJudge.decide(processAlive = true, processHandleIsTheBackend = true, connectionRefused = false))
    }

    @Test
    fun `an exited backend is restarted`() {
        assertEquals(Decision.RESTART, BackendRestartJudge.decide(processAlive = false, processHandleIsTheBackend = true, connectionRefused = false))
    }

    @Test
    fun `a refused connection restarts even when the process is still running`() {
        assertEquals(Decision.RESTART, BackendRestartJudge.decide(processAlive = true, processHandleIsTheBackend = true, connectionRefused = true))
    }

    @Test
    fun `a live wsl handle proves nothing about the backend so the half-open case still restarts`() {
        assertEquals(Decision.RESTART, BackendRestartJudge.decide(processAlive = true, processHandleIsTheBackend = false, connectionRefused = false))
    }

    @Test
    fun `timeouts are not a refused connection`() {
        assertFalse(BackendRestartJudge.isConnectionRefused(HttpTimeoutException("request timed out")))
        assertFalse(BackendRestartJudge.isConnectionRefused(CompletionException(HttpConnectTimeoutException("connect timed out"))))
        assertFalse(BackendRestartJudge.isConnectionRefused(null))
    }

    @Test
    fun `a refused connection is found under the wrapping exception`() {
        assertTrue(BackendRestartJudge.isConnectionRefused(ConnectException("Connection refused")))
        assertTrue(BackendRestartJudge.isConnectionRefused(CompletionException(ConnectException("Connection refused"))))
    }
}
