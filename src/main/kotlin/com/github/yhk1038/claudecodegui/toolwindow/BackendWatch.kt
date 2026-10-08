package com.github.yhk1038.claudecodegui.toolwindow

/**
 * The rhythm the IDE watches a loaded page's backend at, shared by every judge that watches it.
 *
 * Both values come from how the page behaves, not from a feeling for what is long enough:
 *
 *  - [POLL_MS] is the page's own reconnect interval (`scheduleReconnect` in the webview's
 *    `WebSocketConnector`, 2000 ms). Looking more often than the page retries only repeats an
 *    answer that cannot have changed.
 *  - [LOOKS_NEEDED] is what makes one look not enough. A page whose backend just came back is
 *    between two of its retries at the first look, and has made one by the second. A difference
 *    that still shows on the second look is not the page about to reconnect.
 */
object BackendWatch {
    const val POLL_MS = 2_000L
    const val LOOKS_NEEDED = 2
}
