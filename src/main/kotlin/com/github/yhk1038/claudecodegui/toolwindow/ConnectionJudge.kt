package com.github.yhk1038.claudecodegui.toolwindow

/**
 * Decides what the IDE does about a page that is up but not connected to its backend.
 *
 * The page keeps its own "Backend disconnected. Reconnecting..." line and retries forever.
 * Whatever is wrong (a blocked WebSocket, a forwarded port that dropped, an address or pairing
 * the page can no longer use, a backend nobody started again), a retry that has not worked is
 * not going to. The page cannot do anything else, and it cannot ask the IDE for a restart
 * through a backend it cannot reach, so the IDE watches and steps in, in the order that costs
 * the user least:
 *
 *  1. Not connected on [BackendWatch.LOOKS_NEEDED] looks in a row: load the page again. That
 *     builds the address and the pairing anew and leaves every other tab alone.
 *  2. Still not connected on as many looks after the new page has finished loading: put the
 *     guide up, so the user has a Restart button and the way out.
 *  3. The IDE has stopped starting a backend that never came up: the guide at once. Loading the
 *     page again cannot help a tab that has no backend to load from.
 *
 * Nothing here knows why the page is not connected, and nothing counts seconds: the evidence is
 * what the backend says about this panel, looked at on the rhythm of [BackendWatch]. A page that
 * is still loading, a backend that cannot be asked and a restart in progress are "unknown".
 *
 * A pure state machine fed one observation at a time, so it is testable without an IDE.
 */
class ConnectionJudge(private val looksNeeded: Int = BackendWatch.LOOKS_NEEDED) {

    enum class Observation {
        /** The backend lists this panel as connected. */
        CONNECTED,

        /** The backend answered and does not list this panel. */
        NOT_CONNECTED,

        /** The IDE stopped starting the backend: the panel has none and will not get one. */
        BACKEND_GONE,

        /** Cannot be told now (the backend cannot be asked, the page is loading, a restart is under way). */
        UNKNOWN,
    }

    enum class Action {
        NONE,

        /** Load the page again from the backend's current port. */
        RELOAD,

        /** Put the guide up over the page. */
        SHOW_GUIDE,

        /** The page connected: take the guide away. */
        CLEAR_GUIDE,
    }

    private var notConnectedInARow = 0
    private var reloaded = false

    /** False from the reload until the new page has finished loading: a page still loading is not judged. */
    private var pageSettled = true
    private var guideShown = false
    private var dismissed = false

    fun judge(observation: Observation): Action = when (observation) {
        Observation.UNKNOWN -> Action.NONE
        Observation.CONNECTED -> {
            val hadGuide = guideShown
            reset()
            if (hadGuide) Action.CLEAR_GUIDE else Action.NONE
        }
        Observation.BACKEND_GONE -> showGuideOnce()
        Observation.NOT_CONNECTED -> whenNotConnected()
    }

    private fun whenNotConnected(): Action {
        if (!pageSettled) return Action.NONE
        notConnectedInARow += 1
        if (notConnectedInARow < looksNeeded) return Action.NONE
        notConnectedInARow = 0
        if (!reloaded) {
            reloaded = true
            pageSettled = false
            return Action.RELOAD
        }
        return showGuideOnce()
    }

    private fun showGuideOnce(): Action {
        if (guideShown || dismissed) return Action.NONE
        guideShown = true
        return Action.SHOW_GUIDE
    }

    /** The page that was loaded again has finished loading. It gets its own looks from here. */
    fun pageLoadFinished() {
        pageSettled = true
        notConnectedInARow = 0
    }

    /** The user closed the guide. It stays closed until the page has been connected once. */
    fun userDismissed() {
        guideShown = false
        dismissed = true
    }

    /** A page was loaded that this judge did not ask for (a restart, a port change): start over. */
    fun pageLoadedByOthers() = reset()

    private fun reset() {
        notConnectedInARow = 0
        reloaded = false
        pageSettled = true
        guideShown = false
        dismissed = false
    }
}
