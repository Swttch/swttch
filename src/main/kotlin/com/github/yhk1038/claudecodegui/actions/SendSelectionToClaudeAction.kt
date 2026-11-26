package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.bridge.NoopRpcHandler
import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URI

/**
 * Pure, platform-independent logic for building the editor-context payload.
 *
 * Extracted from [SendSelectionToClaudeAction] so it can be unit-tested without
 * the IntelliJ platform, EDT, coroutines, or HTTP. Only string handling and
 * kotlinx.serialization are used here.
 */
object EditorContextPayload {

    /**
     * Compute the path of [absolutePath] relative to [workingDir].
     *
     * Returns [absolutePath] unchanged when:
     * - [workingDir] is null or blank, or
     * - [absolutePath] is not located under [workingDir].
     *
     * A trailing slash on [workingDir] is normalized. Sibling directories that
     * merely share a name prefix (e.g. "/abs/path" vs "/abs/pathology") are not
     * treated as a parent.
     */
    fun computeRelativePath(absolutePath: String, workingDir: String?): String {
        if (workingDir.isNullOrBlank()) return absolutePath
        val normalizedDir = workingDir.trimEnd('/')
        val prefix = "$normalizedDir/"
        return if (absolutePath.startsWith(prefix)) {
            absolutePath.substring(prefix.length)
        } else {
            absolutePath
        }
    }

    /**
     * Build the JSON payload sent to the backend's /internal/editor-context endpoint.
     *
     * When there is no selection, [startLine] and [endLine] are null and serialized
     * as JSON null. [workingDir] is serialized as JSON null when null. Note that
     * selectedText and language are intentionally omitted — the chat input only
     * needs the file path and optional line range.
     */
    fun buildPayload(
        absolutePath: String,
        relativePath: String,
        startLine: Int?,
        endLine: Int?,
        workingDir: String?
    ): JsonObject = buildJsonObject {
        put("absolutePath", JsonPrimitive(absolutePath))
        put("relativePath", JsonPrimitive(relativePath))
        put("startLine", startLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("endLine", endLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
    }

    /**
     * Build the JSON payload sent to the backend's /internal/ide-selection endpoint.
     *
     * Extends [buildPayload] with [selectedText] so the passive auto-selection
     * channel can transmit the currently selected text alongside the file and line
     * range. When [selectedText] is null (no selection or tab-only switch),
     * [startLine], [endLine], and [selectedText] are all serialized as JSON null.
     *
     * Contract agreed with the backend:
     * ```
     * { absolutePath, relativePath,
     *   startLine: number | null,   // 1-based, null when no selection
     *   endLine:   number | null,
     *   selectedText: string | null,
     *   workingDir: string,
     *   isGitignored: boolean }      // true when the file is VCS-ignored
     * ```
     */
    fun buildSelectionPayload(
        absolutePath: String,
        relativePath: String,
        startLine: Int?,
        endLine: Int?,
        selectedText: String?,
        workingDir: String?,
        isGitignored: Boolean = false
    ): JsonObject = buildJsonObject {
        put("absolutePath", JsonPrimitive(absolutePath))
        put("relativePath", JsonPrimitive(relativePath))
        put("startLine", startLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("endLine", endLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("selectedText", selectedText?.let { JsonPrimitive(it) } ?: JsonNull)
        put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
        put("isGitignored", JsonPrimitive(isGitignored))
    }
}

/**
 * Editor action that sends the current file path (and selected line range, if any)
 * to the Claude Code chat input.
 *
 * Triggered via Alt+K or the editor context menu. The action:
 * 1. Extracts file path + optional selection range from the editor.
 * 2. Ensures the Node.js backend is running and focuses/opens a Claude Code tab.
 * 3. POSTs the editor context to the backend's /internal/editor-context endpoint
 *    on a background coroutine (fire-and-forget).
 *
 * The backend forwards the context to the webview, which inserts it as text into
 * the chat input (implemented in later stages).
 */
class SendSelectionToClaudeAction : AnAction() {

    private val logger = Logger.getInstance(SendSelectionToClaudeAction::class.java)

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val selectionModel = editor.selectionModel
        val hasSelection = selectionModel.hasSelection() && selectionModel.selectedText != null
        val startLine: Int?
        val endLine: Int?
        if (hasSelection) {
            // Editor positions are 0-based; the payload uses 1-based line numbers.
            startLine = selectionModel.selectionStartPosition?.line?.plus(1)
            endLine = selectionModel.selectionEndPosition?.line?.plus(1)
        } else {
            startLine = null
            endLine = null
        }

        val absolutePath = vFile.path
        val workingDir = project.basePath
        val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)
        val payload = EditorContextPayload.buildPayload(
            absolutePath = absolutePath,
            relativePath = relativePath,
            startLine = startLine,
            endLine = endLine,
            workingDir = workingDir
        )

        // Ensure the backend is running. A transient panel id keeps a no-op handler
        // registered only for the lifetime of this request, then is released in finally.
        val backend = NodeBackendService.getInstance()
        val transientPanelId = "action-transient-" + System.currentTimeMillis()
        // Key the backend by IDE project root (not workingDir) so this action shares
        // the same per-root backend as the project's Claude Code panels (#57).
        val backendKey = project.basePath ?: workingDir ?: ""
        backend.ensureStarted(backendKey, transientPanelId, NoopRpcHandler)

        // Send the mention, THEN reveal based on the backend's answer. The mention
        // routes to the last-focused panel (browser or JCEF); the response's
        // revealTarget tells us what to reveal in the IDE — focus that JCEF tab, do
        // nothing for a browser tab, or open a fresh tab when nothing is focused
        // (ConnectionManager.getRevealTarget). Reveal used to be unconditional,
        // which popped an IDE tab even when the active Claude was a browser tab.
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val port = backend.awaitPort(backendKey)
                // /internal routes require the stable token (Phase 1 defense-in-depth).
                val response = postJson(port, "/internal/editor-context", payload, backend.authToken(backendKey))
                revealFromResponse(project, response)
            } catch (ex: Exception) {
                logger.warn("Failed to send editor context to backend", ex)
            } finally {
                backend.releasePanel(backendKey, transientPanelId, NoopRpcHandler)
            }
        }
    }

    /**
     * Reveal in the IDE according to the backend's revealTarget, on the EDT:
     *   - jcef    → focus/open that exact panel (panelId == tabId after unification);
     *               host-aware, so a hidden tool-window panel is reopened and focused.
     *   - browser → do nothing; the active Claude is a browser tab (the mention
     *               already routed there via routeToFocusedOrBroadcast).
     *   - none    → nothing was focused/alive, so open a fresh tab (host-aware).
     */
    private fun revealFromResponse(project: Project, response: String?) {
        var kind = "none"
        var panelId: String? = null
        if (response != null) {
            try {
                val revealTarget = Json.parseToJsonElement(response).jsonObject["revealTarget"]?.jsonObject
                if (revealTarget != null) {
                    kind = revealTarget["kind"]?.jsonPrimitive?.content ?: "none"
                    panelId = revealTarget["panelId"]?.jsonPrimitive?.contentOrNull
                }
            } catch (ex: Exception) {
                logger.warn("Failed to parse editor-context revealTarget; opening host default", ex)
            }
        }
        val targetPanelId = panelId
        ApplicationManager.getApplication().invokeLater {
            when {
                kind == "jcef" && targetPanelId != null -> OpenClaudeCodeAction.focusTab(project, targetPanelId)
                kind == "browser" -> Unit // active Claude is a browser tab — leave the IDE alone
                else -> OpenClaudeCodeAction.openOrFocus(project)
            }
        }
    }

    private fun postJson(port: Int, path: String, payload: JsonObject, authToken: String?): String? {
        val url = URI("http://127.0.0.1:$port$path").toURL()
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            // Stable control-channel token in the custom header the backend requires
            // on the /internal routes (mirrors backend HTTP_AUTH_HEADER). Never logged.
            if (!authToken.isNullOrEmpty()) conn.setRequestProperty("x-ccg-token", authToken)
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            logger.info("POST $path returned HTTP $code")
            // Return the JSON body on success so the caller can act on revealTarget.
            return if (code in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else null
        } finally {
            conn.disconnect()
        }
    }

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE)
        // Disable inside the Claude Code JCEF panel itself.
        e.presentation.isEnabledAndVisible =
            editor != null && vFile != null && vFile !is ClaudeCodeVirtualFile
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}
