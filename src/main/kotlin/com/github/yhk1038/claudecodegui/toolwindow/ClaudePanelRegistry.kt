package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The Claude Code panels that are open, by the project root whose backend they use.
 *
 * Every panel of a project shares one backend, so a restart of that backend has to reach
 * all of them: each one holds a page loaded from the old backend. The status-bar card has
 * no other way to find the panels, so it asks here.
 *
 * [restart] is the one restart. The status card's Restart, the guide's restart button, and every
 * recovery path of the backend service (a crash, a clean exit that left a tab behind, a restart
 * the backend asked for) all end up in it, so a restart does the same thing wherever it begins.
 */
object ClaudePanelRegistry {

    private val logger = Logger.getInstance(ClaudePanelRegistry::class.java)
    private val panels = CopyOnWriteArrayList<ClaudeCodePanel>()
    private val restartGate = RestartGate()

    init {
        wire()
    }

    /**
     * Tells the backend service that [restart] is the function for every restart. The service is
     * below this layer and cannot name it, so it keeps a slot that is filled here. Called from the
     * first use of this object and again from project open, which is before any recovery can run.
     */
    fun wire() {
        NodeBackendService.getInstance().restartFacade = ::restart
    }

    fun register(panel: ClaudeCodePanel) {
        panels.addIfAbsent(panel)
    }

    fun unregister(panel: ClaudeCodePanel) {
        panels.remove(panel)
    }

    /**
     * The panels of [projectBasePath] that have a page to load again. A tab restored with the
     * editor is registered too but has no browser until it is first shown; it is left out here
     * because there is nothing in it to reload or to restart.
     */
    fun panelsOf(projectBasePath: String): List<ClaudeCodePanel> =
        panels.filter { it.projectBasePath == projectBasePath && it.isRealized }

    /**
     * Loads every panel of [projectBasePath] again from the backend's current port.
     * The backend keeps running. Returns how many panels were asked.
     */
    fun reload(projectBasePath: String): Int {
        val targets = panelsOf(projectBasePath)
        logger.info("Reload requested for ${targets.size} panel(s) of '$projectBasePath'")
        targets.forEach { it.reloadFromCurrentPort() }
        return targets.size
    }

    /**
     * Restarts the backend of [projectBasePath] once and loads every panel of it again
     * when it is back. Safe to call with no panel open: the backend is still restarted.
     *
     * The restart waits for the old process to go away, so it runs off the caller's thread.
     */
    fun restart(projectBasePath: String) {
        if (!restartGate.enter(projectBasePath)) {
            logger.info("Restart requested for the backend of '$projectBasePath' but one is already running; dropped")
            return
        }
        val targets = panelsOf(projectBasePath)
        logger.info("Restart requested for the backend of '$projectBasePath' (${targets.size} panel(s))")
        targets.forEach { it.markRestarting() }
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                NodeBackendService.getInstance().restart(projectBasePath)
            } catch (e: Exception) {
                logger.warn("Backend restart threw for '$projectBasePath'", e)
            }
            targets.forEach { it.awaitRestartedBackend() }
            restartGate.leave(projectBasePath)
        }
    }
}
