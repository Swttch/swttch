package com.github.yhk1038.claudecodegui.bridge

/**
 * A [NodeProcessManager.RpcHandler] that ignores every request.
 *
 * Used when a caller only needs the backend *process* to be running (so its RPC
 * socket connects and the backend can push state such as HOST_MODE_CHANGED) but
 * has no panel to service IDE-side requests. Registered against a transient panel
 * id and released once the caller is done.
 *
 * Shared by [com.github.yhk1038.claudecodegui.actions.SendSelectionToClaudeAction]
 * (send-selection prewarm) and
 * [com.github.yhk1038.claudecodegui.startup.ChatHostRestoreActivity] (awaiting the
 * first hostMode push to close the PR #146 first-open race).
 */
object NoopRpcHandler : NodeProcessManager.RpcHandler {
    override suspend fun openFile(path: String, line: Int?, column: Int?) {}
    override suspend fun openDiff(
        filePath: String,
        oldContent: String,
        newContent: String,
        toolUseId: String?,
        sessionId: String?,
        controlRequestId: String?,
    ) {}
    override suspend fun applyDiff(filePath: String, newContent: String, toolUseId: String?): Boolean = false
    override suspend fun rejectDiff(toolUseId: String?) {}
    override suspend fun closeDiff(toolUseId: String) {}
    override suspend fun openDiffTab(toolUseId: String) {}
    override suspend fun closeDiffTab(toolUseId: String) {}
    override suspend fun refreshFiles(paths: List<String>) {}
    override suspend fun createSession(workingDir: String) {}
    override suspend fun openNewTab(workingDir: String) {}
    override suspend fun openSession(sessionId: String, workingDir: String?) {}
    override suspend fun setTabName(panelId: String, name: String) {}
    override suspend fun openSettings(workingDir: String, path: String?) {}
    override suspend fun openTerminal(workingDir: String) {}
    override suspend fun reviewBaseChanged(
        toolUseId: String,
        filePath: String,
        reason: String,
        overlapsAccepted: Boolean,
        blockedApproval: Boolean,
    ) {}

    override suspend fun redrawReview(
        toolUseId: String,
        filePath: String,
        oldContent: String,
        newContent: String,
    ) {}

    override suspend fun openDevTools() {}
    override suspend fun openUrl(url: String) {}
    override suspend fun pickFiles(mode: String, multiple: Boolean): List<String> = emptyList()
    override suspend fun updatePlugin() {}
    override suspend fun requiresRestart(): Boolean = false
    override suspend fun getIdeRoot(workingDir: String?): String? = null
}
