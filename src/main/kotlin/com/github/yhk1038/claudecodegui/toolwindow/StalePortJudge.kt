package com.github.yhk1038.claudecodegui.toolwindow

/**
 * Decides when a page has been left on a backend port that is no longer the backend's.
 *
 * A page keeps asking the address it was loaded from, so a backend that came back on another
 * port leaves it talking to nothing. The port is the IDE's to know, so the IDE loads the page
 * again. The difference has to show on [looksNeeded] looks in a row before it counts, so a
 * restart that is still settling is not loaded twice, and nothing is judged while a restart is
 * known to be under way.
 */
class StalePortJudge(private val looksNeeded: Int = 2) {

    private var differentInARow = 0

    /**
     * The port to load the page from now, or null when nothing should be done.
     *
     * [loaded] is the port the page was last loaded from, [current] the backend's port right now
     * (null while it has none), [restarting] whether a restart is in progress.
     */
    fun portToLoad(loaded: Int?, current: Int?, restarting: Boolean): Int? {
        if (loaded == null || current == null || restarting || current == loaded) {
            differentInARow = 0
            return null
        }
        differentInARow += 1
        if (differentInARow < looksNeeded) return null
        differentInARow = 0
        return current
    }
}
