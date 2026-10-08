package com.github.yhk1038.claudecodegui.toolwindow

import java.util.concurrent.ConcurrentHashMap

/**
 * Lets one restart of a project's backend run at a time.
 *
 * Several things can ask for a restart in the same moment: the user presses Restart while the
 * IDE's own recovery has just noticed the backend is gone, or two recovery paths see the same
 * exit. Every one of them goes through the same restart function, and that function must not
 * restart the backend twice for one failure. A request that arrives while a restart of the same
 * project is running is dropped, because the running one already does what was asked.
 *
 * Thread-safe: requests come from the UI thread, pooled threads and the process watchers.
 */
class RestartGate {

    private val running = ConcurrentHashMap.newKeySet<String>()

    /** True when the caller may restart [projectBasePath] now; false when one is already running. */
    fun enter(projectBasePath: String): Boolean = running.add(projectBasePath)

    /** The restart of [projectBasePath] is over. */
    fun leave(projectBasePath: String) {
        running.remove(projectBasePath)
    }
}
