package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.bridge.NoopRpcHandler
import com.github.yhk1038.claudecodegui.hosting.ChatHostRouter
import com.github.yhk1038.claudecodegui.hosting.HostModeCache
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Restores persisted Claude Code chat sessions after an IDE restart.
 *
 * Host-agnostic: it asks the [ChatHostRouter] for the current host and lets it
 * restore its own sessions. Because the persisted state
 * ([com.github.yhk1038.claudecodegui.services.EditorTabStateService]) is shared
 * across hosts, switching `hostMode` and restarting naturally restores the same
 * session list into whichever host is now current.
 *
 * ## First-open timing race (PR #146)
 *
 * The host is chosen from the cached `hostMode` ([HostModeCache]). The backend is
 * the single source of truth for that value and pushes it over RPC on connect —
 * but on a fresh install the backend has not started yet when this activity runs,
 * so the cache is still empty and a naive read would fall back to EDITOR_TAB,
 * ignoring a "Sidebar" (tool-window) choice.
 *
 * This activity is the **only** place that closes that race: when it has sessions
 * to restore but the cache is empty, it briefly prewarms the backend (a transient
 * no-op panel) and awaits the first HOST_MODE_CHANGED push, bounded by
 * [HOST_MODE_AWAIT_TIMEOUT_MS], before deciding the host. Every other entry point
 * (the "+" button, Cmd+N, the popup, the tool-window factory) keeps reading the
 * persistent cache synchronously with zero delay — by then the value is present.
 *
 * The wait is skipped entirely when the already-cached value is non-empty (the
 * common case, since [com.intellij.ide.util.PropertiesComponent] persists it) or
 * when there are no persisted sessions to restore.
 */
class ChatHostRestoreActivity : ProjectActivity {

    private val logger = Logger.getInstance(ChatHostRestoreActivity::class.java)

    override suspend fun execute(project: Project) {
        createTabStateOffTheEdt(project)
        resolveHostMode(project)
        ChatHostRouter.currentHost(project).restorePersistedSessions(project)
    }

    /**
     * Create [EditorTabStateService] here, where "here" is a background thread.
     *
     * This looks redundant next to [resolveHostMode], which reads the same service
     * on its first line. It is not: **creating the service is a job this activity
     * owns**, and leaving that to a side effect of some later read means any
     * refactor of that read silently hands the job back to whoever asks first.
     *
     * Whoever asks first is sometimes the EDT, and the EDT must not be the one to
     * create it — see [EditorTabStateService.getInstanceIfCreated] for the WSL
     * crash that causes (issue #438). Doing it on the first line of the first
     * project-scoped code we run is what keeps the EDT paths finding a service
     * that already exists.
     */
    private fun createTabStateOffTheEdt(project: Project) {
        EditorTabStateService.getInstance(project)
    }

    /**
     * Ensure the cached `hostMode` reflects the user's real choice before the host
     * is picked. Returns as fast as possible:
     *
     *  - no persisted sessions → nothing to restore, so the host choice is moot;
     *    return without any wait or backend spawn;
     *  - cache already populated → return immediately (zero delay);
     *  - cache empty with sessions to restore → prewarm the backend and await the
     *    first push (bounded), so the restore lands in the host the user selected.
     */
    private suspend fun resolveHostMode(project: Project) {
        val hasSessions = EditorTabStateService.getInstance(project).getOpenTabIds().isNotEmpty()
        if (!hasSessions) return

        // Persistent cache already holds the value → no wait needed.
        if (HostModeCache.hasCachedValue()) return

        val backend = NodeBackendService.getInstance()
        val backendKey = project.basePath ?: return
        val transientPanelId = "chat-host-restore-" + System.currentTimeMillis()

        // Prewarm the backend so it connects and pushes HOST_MODE_CHANGED. The no-op
        // handler is released as soon as we have the value; the Node process self-exits
        // on idle if the user never opens a chat.
        backend.ensureStarted(backendKey, transientPanelId, NoopRpcHandler)
        try {
            val mode = HostModeCache.firstPushSignal.await(HOST_MODE_AWAIT_TIMEOUT_MS)
            logger.info("Resolved hostMode before restore: $mode")
        } finally {
            backend.releasePanel(backendKey, transientPanelId)
        }
    }

    companion object {
        /**
         * Upper bound on the first-push wait. It only matters on the first run before
         * any push (persistence short-circuits every later run), so a generous but
         * finite ceiling is safe: it covers a cold backend spawn + RPC connect on a
         * slow machine, yet never blocks startup indefinitely (the lesson of issue
         * #97). On timeout the caller falls back to EDITOR_TAB — the safe default.
         */
        private const val HOST_MODE_AWAIT_TIMEOUT_MS = 5_000L
    }
}
