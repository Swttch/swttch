package com.github.yhk1038.claudecodegui.bridge

/**
 * Liveness for the IDE's /rpc control channel, from the IDE side.
 *
 * [RpcWebSocketClient] only reconnects (and, after repeated failures, restarts the
 * backend) when the socket reports `onClose` or `onError`. A backend that disappears
 * WITHOUT closing its socket never produces either: when the WSL VM is shut down the
 * whole network stack on the other end vanishes, no FIN or RST ever reaches Windows,
 * and the IDE's connection stays ESTABLISHED forever. Nothing in the recovery chain
 * starts, and the panel sits on "Backend disconnected. Reconnecting..." until the IDE
 * is restarted (issue #516).
 *
 * TCP alone cannot notice this: a half-open connection looks identical to an idle one
 * until something is written, and an idle IDE writes nothing. So the client asks, on a
 * timer, and gives up on the socket when nothing answers. The backend's `ws` server
 * answers a ping with a pong on its own, so the backend needs no change for this.
 *
 * This class is the pure decision half: no sockets, no coroutines, an injected clock.
 * The same principle on the backend side lives in `backend/src/ws/connection-heartbeat.ts`.
 *
 * -- The bar this has to clear --
 *
 * Being slow to notice a dead backend costs the user some seconds of a red banner.
 * Declaring a LIVE backend dead costs a reconnect and, after repeated failures, a
 * backend restart that kills the session the user is working in. The two are not
 * comparable, so every constant here is sized for the second one:
 *
 *  - a socket is only declared dead after [silenceLimitMs] of silence, three full
 *    rounds at the default interval, far longer than any slow round trip;
 *  - ANY frame from the backend counts as a sign of life, not just a pong, so a
 *    proxy that swallows control frames cannot make a talking backend look dead;
 *  - a tick that arrives far later than it was due is read as this machine having
 *    been suspended (a laptop lid closed and reopened), and grants the socket a
 *    fresh start instead of billing it for the frozen interval.
 *
 * One instance watches exactly one connection. A new connection gets a new tracker.
 * [markAlive] is called from the WebSocket listener thread and [tick] from the
 * liveness coroutine, so the timestamps are volatile; the worst interleaving of the
 * two only ever makes the socket look more alive, never less.
 */
class RpcLivenessTracker(
    private val now: () -> Long = System::currentTimeMillis,
    /** How often the client asks the backend whether it is still there. */
    val intervalMs: Long = INTERVAL_MS,
    /** Silence longer than this, with no suspend in between, means the socket is dead. */
    val silenceLimitMs: Long = SILENCE_LIMIT_MS,
) {
    enum class Verdict {
        /** The socket may be alive: ask again with a ping. */
        SEND_PING,

        /** Nothing has come back for longer than [silenceLimitMs]: give up on the socket. */
        DEAD,
    }

    @Volatile
    private var lastAliveAt: Long = now()

    @Volatile
    private var lastTickAt: Long = lastAliveAt

    /**
     * Record a sign of life: any frame (pong, text, ping) received on this connection.
     *
     * Text counts because the pong is a control frame, and a control frame only proves
     * the backend is there if everything between us forwards it. An application message
     * proves the same thing without that assumption.
     */
    fun markAlive() {
        lastAliveAt = now()
    }

    /** One round: decide whether to keep asking or to give up on the socket. */
    fun tick(): Verdict {
        val at = now()
        val sinceLastTick = at - lastTickAt
        lastTickAt = at

        // A tick this late means this machine was asleep, not that the backend went
        // quiet. Billing the socket for the frozen interval is exactly the mistake that
        // costs a live session, so the round is spent forgiving instead of judging.
        if (sinceLastTick > intervalMs * SUSPEND_GRACE_FACTOR) {
            lastAliveAt = at
            return Verdict.SEND_PING
        }

        return if (at - lastAliveAt > silenceLimitMs) Verdict.DEAD else Verdict.SEND_PING
    }

    companion object {
        /** How often the client pings the backend. */
        const val INTERVAL_MS: Long = 15_000

        /**
         * Silence tolerated before a socket is declared dead: three full rounds at the
         * default interval, so one or two lost pongs never cost a live connection.
         */
        const val SILENCE_LIMIT_MS: Long = 45_000

        /**
         * A tick later than `interval * this` did not arrive late because a thread was
         * busy; the machine was asleep. Nothing is counted against the socket on such a tick.
         */
        const val SUSPEND_GRACE_FACTOR: Int = 2
    }
}
