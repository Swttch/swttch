package com.github.yhk1038.claudecodegui.editor

/**
 * What the WebView reports one tab is doing, so the tab icon can say the same
 * thing the browser favicon says (issue #456).
 *
 * Three states rather than a boolean, because a session blocked on a prompt is
 * neither of the other two. The turn has not ended, so it is not [IDLE]; nothing
 * is running, so calling it [STREAMING] advertises work that is not happening —
 * which is what the spinning tab icon was doing while the CLI sat waiting for an
 * answer.
 *
 * The names match the strings the WebView sends through
 * `window.__notifyStreamingState` (see `useDocumentTitle.ts`), so the same word
 * can be grepped on both sides of the bridge.
 */
enum class TabActivity {
    /** A turn is in flight. */
    STREAMING,

    /**
     * The CLI has stopped and is waiting for the user to answer a tool
     * permission, a plan approval, or an AskUserQuestion card.
     */
    AWAITING,

    /** Nothing in flight. */
    IDLE;

    companion object {
        /**
         * Read a state reported by the WebView, treating anything unrecognized as
         * [IDLE].
         *
         * Unrecognized is not an error worth failing on: an older WebView bundled
         * with a newer plugin reports only `streaming` and `idle`, and the honest
         * reading of a word this build does not know is "no claim that work is
         * happening".
         */
        fun fromReport(state: String): TabActivity = when (state) {
            "streaming" -> STREAMING
            "awaiting" -> AWAITING
            else -> IDLE
        }
    }
}
