package com.github.yhk1038.claudecodegui.bridge

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
 * Restart is right in two cases only: the process has exited (nothing left to wait for), and
 * the process handle proves nothing about the backend, which is the WSL case: the handle is
 * `wsl.exe`, and a half-open socket after the VM went away (issue #516) is exactly a live
 * handle with a dead backend behind it. A refused connection is not a third case: a process
 * that is running and refuses a connection is still a running backend, and the client keeps
 * reconnecting to it.
 */
internal object BackendRestartJudge {
    enum class Decision {
        /** Stop the backend and start a new one. */
        RESTART,

        /** The backend is alive and only slow: keep reconnecting, kill nothing. */
        KEEP_WAITING,
    }

    fun decide(processAlive: Boolean, processHandleIsTheBackend: Boolean): Decision =
        when {
            !processAlive -> Decision.RESTART
            !processHandleIsTheBackend -> Decision.RESTART
            else -> Decision.KEEP_WAITING
        }
}
