package com.github.yhk1038.claudecodegui.bridge

import java.net.ConnectException

/**
 * Decides what to do once the /rpc socket has failed to (re)connect several times in a row.
 *
 * A timeout is not proof of death. When the whole machine stalls (a swapping laptop, a
 * suspended VM, an antivirus scan), the backend can sit unanswered for minutes and still be
 * perfectly alive, with every Claude CLI it spawned and every workflow it is running. Killing
 * it then turns a slow stretch into a lost session (issue #622). So a backend process this
 * plugin started, and which the OS still reports as running, is never restarted on timeouts
 * alone: the client keeps reconnecting until it answers or the process is gone.
 *
 * Restart stays right in three cases:
 *  - the process has exited (nothing left to wait for);
 *  - a connection was actively refused (the process is up but nothing listens on the port);
 *  - the process handle proves nothing about the backend, which is the WSL case: the handle is
 *    `wsl.exe`, and a half-open socket after the VM went away (issue #516) is exactly a live
 *    handle with a dead backend behind it.
 */
internal object BackendRestartJudge {
    enum class Decision {
        /** Stop the backend and start a new one. */
        RESTART,

        /** The backend is alive and only slow: keep reconnecting, kill nothing. */
        KEEP_WAITING,
    }

    fun decide(processAlive: Boolean, processHandleIsTheBackend: Boolean, connectionRefused: Boolean): Decision =
        when {
            !processAlive -> Decision.RESTART
            connectionRefused -> Decision.RESTART
            !processHandleIsTheBackend -> Decision.RESTART
            else -> Decision.KEEP_WAITING
        }

    /**
     * True when [error] (usually a CompletionException around the real cause) is a refused
     * connection. A connect that merely timed out, `HttpConnectTimeoutException`, is NOT one.
     */
    fun isConnectionRefused(error: Throwable?): Boolean {
        var cause = error
        var depth = 0
        while (cause != null && depth < 8) {
            if (cause is ConnectException) return true
            cause = cause.cause
            depth++
        }
        return false
    }
}
