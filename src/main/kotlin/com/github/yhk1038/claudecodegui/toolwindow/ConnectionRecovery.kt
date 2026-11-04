package com.github.yhk1038.claudecodegui.toolwindow

/**
 * The rule for a page that cannot reach its backend: while the IDE's own status widget says the
 * backend is running, the page is put back on it.
 *
 * The page does not give up. It retries its own socket for as long as it lives, and each time a
 * run of those retries fails it tells the IDE so (`connection-lost` on the page-to-IDE channel).
 * The IDE answers every such report the same way: build the address anew from the backend's
 * current port, with a fresh pairing, and load the page from it. Nothing here asks why the page
 * could not connect, and nothing counts seconds: the evidence is the page's own failed retries,
 * and the pace is theirs.
 *
 * A backend that is not running is not this rule's business. Starting it again belongs to the
 * crash and exit recovery, which loads the page when the new backend is up.
 *
 * The same rule answers a load that failed outright (nothing came back for the address, so there
 * is no page to report): [PageRetry.INTERVAL_MS] later the load is asked for again, for as long
 * as the backend runs.
 */
object ConnectionRecovery {

    enum class Action {
        /** Load the page again from the backend's current port. */
        LOAD_AGAIN,

        /**
         * The backend is running but is not answering the IDE yet: ask again at the page's own
         * pace. A page loaded now would hang on the unanswering backend and stay hung after it
         * answers again (measured: the load never finished and the guide stayed up).
         */
        ASK_AGAIN_LATER,

        /** Leave the page as it is. */
        NOTHING,
    }

    /**
     * @param backendRunning whether the status widget would show the backend as running.
     * @param port the backend's current port, or null while it has none.
     * @param restarting whether a restart is under way (the page is loaded when it ends).
     * @param loadInFlight whether a load of the page has started and not finished.
     * @param backendAnswering whether the backend answers the IDE's own socket right now.
     */
    fun decide(
        backendRunning: Boolean,
        port: Int?,
        restarting: Boolean,
        loadInFlight: Boolean,
        backendAnswering: Boolean,
    ): Action = when {
        !backendRunning -> Action.NOTHING
        port == null -> Action.NOTHING
        restarting -> Action.NOTHING
        // A page that is still being replaced cannot be reported on, and loading again would race it.
        loadInFlight -> Action.NOTHING
        !backendAnswering -> Action.ASK_AGAIN_LATER
        else -> Action.LOAD_AGAIN
    }
}

/** The pace of retrying a load that failed. */
object PageRetry {
    /**
     * The page's own reconnect interval (`scheduleReconnect` in the webview's `WebSocketConnector`,
     * 2000 ms). A failed load is retried at the rhythm the page itself retries at, so neither side
     * is faster than the other.
     */
    const val INTERVAL_MS = 2_000L
}
