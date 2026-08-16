package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.actions.EditorContextPayload
import com.github.yhk1038.claudecodegui.hosting.ToolWindowHost
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.util.Alarm
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URI

/**
 * Passive auto-selection channel that pushes the current editor file path and
 * selection to the backend's `/internal/ide-selection` endpoint whenever the
 * active editor or selection changes.
 *
 * This is **separate** from [com.github.yhk1038.claudecodegui.actions.SendSelectionToClaudeAction]
 * (the manual Alt+K action that posts to `/internal/editor-context`).
 *
 * ### Gating
 * Events are dispatched only when there is a consumer able to show the selection:
 * either a [ClaudeCodeVirtualFile] editor tab is open, OR the Claude Code tool
 * window is currently visible. If neither is present the HTTP call is suppressed
 * entirely. (See [hasSelectionConsumer].)
 *
 * The active file must not itself be a [ClaudeCodeVirtualFile] (the Claude panel
 * is not a real source file).
 *
 * ### Debounce
 * Selection events fire continuously during a drag. A 200 ms [Alarm]-based debounce
 * collapses bursts into a single dispatch after the burst ends.
 *
 * ### Deduplication
 * If the (absolutePath, startLine, endLine) triple is identical to the last
 * successfully dispatched event, the POST is skipped.
 */
object IdeSelectionDispatcher {

    private val logger = Logger.getInstance(IdeSelectionDispatcher::class.java)
    private val ioScope = CoroutineScope(Dispatchers.IO)

    /**
     * Tracks the last dispatched key so identical consecutive events are skipped.
     * Triple of (absolutePath, startLine, endLine).
     */
    @Volatile
    private var lastDispatched: Triple<String, Int?, Int?> = Triple("", null, null)

    /**
     * Clear the dedup cache so the next dispatch is never suppressed as a
     * duplicate of the previously sent key.
     *
     * When the webview (the selection-chip consumer) reloads, its on-screen chips
     * are wiped back to the empty initial state, but this dispatcher still
     * remembers the last key it sent. Without this reset, focusing the same file
     * with no selection again yields the identical key `(path, null, null)`, which
     * the dedup check in [doDispatch] would skip — so the chip would never
     * reappear after a reload. Call this on the reload boundary to force the next
     * dispatch through.
     */
    fun clearDedupCache() {
        lastDispatched = Triple("", null, null)
    }

    /**
     * Whether [dispatchActiveEditor] should push the given active file. Returns
     * false when there is no active file (`null`) or when the active file is the
     * Claude panel's own JCEF virtual file (a [ClaudeCodeVirtualFile], which is
     * not a real source file).
     *
     * Extracted as a pure predicate so the no-op contract is unit-testable
     * without a platform harness.
     */
    fun shouldDispatchActiveEditor(vFile: VirtualFile?): Boolean =
        vFile != null && vFile !is ClaudeCodeVirtualFile

    /**
     * Re-query the IDE's current active editor/file and dispatch it immediately,
     * synchronizing the backend's `lastIdeSelection` to whatever the user is
     * viewing **now**.
     *
     * ### Why this exists
     * While the tool window is closed, Gate 2 in [scheduleDispatch] suppresses
     * focus changes (there is no visible consumer). So if the user focuses file A,
     * closes the tool window, then focuses file B, the backend still holds A. When
     * the window re-opens the backend would replay the stale A to the freshly
     * connected webview. Calling this on the open/reload boundary re-reads the
     * *current* active file (B) and pushes it, so the backend replays the correct
     * file. This turns "restore the pre-close state" into "sync to the current
     * IDE state".
     *
     * ### Behavior
     * - No active file, or the active file is a [ClaudeCodeVirtualFile] → no-op
     *   (see [shouldDispatchActiveEditor]).
     * - Otherwise: [clearDedupCache] first (the current file's key may equal the
     *   last key sent before the window closed; without the reset the dedup check
     *   in [doDispatch] would drop it), then [scheduleDispatch].
     *
     * ### Threading
     * Safe to call off the EDT. The body runs inside
     * [ApplicationManager]'s `invokeLater` because the FileEditorManager reads and
     * the [Alarm] used by [scheduleDispatch] must run on the EDT, and this is
     * invoked from a CEF load callback thread (not the EDT).
     */
    fun dispatchActiveEditor(project: Project) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            val fem = FileEditorManager.getInstance(project)
            val editor = fem.selectedTextEditor
            val vFile = fem.selectedEditor?.file
            if (!shouldDispatchActiveEditor(vFile)) return@invokeLater
            // Force the current file through even if its key matches the last one
            // dispatched before the tool window closed.
            clearDedupCache()
            scheduleDispatch(project, editor, vFile!!)
        }
    }

    /**
     * Per-project [Alarm] instances for debounce. Keys are project hash codes.
     * [Alarm] is not thread-safe; all access must happen on the EDT, which is
     * guaranteed because both [FileEditorManagerListener.selectionChanged] and
     * [com.intellij.openapi.editor.SelectionListener.selectionChanged] are always
     * called on the EDT.
     */
    private val alarms = mutableMapOf<Int, Alarm>()

    /**
     * Return (or create) the debounce [Alarm] for [project].
     *
     * Must be called on the EDT.
     */
    fun alarmFor(project: Project): Alarm =
        alarms.getOrPut(project.hashCode()) { Alarm(Alarm.ThreadToUse.SWING_THREAD) }

    /**
     * Dispose the [Alarm] associated with [project] when the project closes.
     *
     * Must be called on the EDT.
     */
    fun disposeAlarm(project: Project) {
        alarms.remove(project.hashCode())?.dispose()
    }

    /**
     * Whether an ide-selection push has a consumer able to display it: either a
     * Claude Code editor tab is open, or the Claude Code tool window is visible.
     *
     * Extracted as a pure predicate so the OR gate is unit-testable without a
     * platform harness (the two booleans are computed from platform APIs at the
     * call site). Users who run Claude only in the tool window would otherwise
     * never receive the context chip.
     */
    fun hasSelectionConsumer(hasClaudeEditorTab: Boolean, isToolWindowVisible: Boolean): Boolean =
        hasClaudeEditorTab || isToolWindowVisible

    /**
     * Schedule a debounced dispatch for the given [editor] / [vFile] within [project].
     *
     * Cancels any pending alarm for the project and schedules a new one to fire
     * after [DEBOUNCE_MS] milliseconds. Must be called on the EDT.
     *
     * @param project   The IDE project that owns this editor.
     * @param editor    The active [Editor] whose selection to read (may be null if
     *                  the file switch came from a tab-only focus event where no
     *                  editor reference is available — e.g. a future extension point).
     * @param vFile     The virtual file now active in the editor.
     */
    fun scheduleDispatch(project: Project, editor: Editor?, vFile: VirtualFile) {
        // Gate 1: ignore Claude Code panel files.
        if (vFile is ClaudeCodeVirtualFile) return

        // Gate 2: suppress when there is no consumer for the push — neither a
        // Claude Code editor tab open nor a visible Claude Code tool window.
        val fem = FileEditorManager.getInstance(project)
        val hasClaudeEditorTab = fem.openFiles.any { it is ClaudeCodeVirtualFile }
        val isToolWindowVisible =
            ToolWindowManager.getInstance(project)
                .getToolWindow(ToolWindowHost.TOOL_WINDOW_ID)
                ?.isVisible == true
        if (!hasSelectionConsumer(hasClaudeEditorTab, isToolWindowVisible)) return

        val alarm = alarmFor(project)
        alarm.cancelAllRequests()
        alarm.addRequest(
            { doDispatch(project, editor, vFile) },
            DEBOUNCE_MS
        )
    }

    /**
     * Perform the actual payload build and HTTP POST (called from alarm callback,
     * still on the EDT). Launches HTTP I/O on [ioScope] to avoid blocking the EDT.
     */
    private fun doDispatch(project: Project, editor: Editor?, vFile: VirtualFile) {
        val absolutePath = vFile.path
        val workingDir = project.basePath
        val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)

        val selectionModel = editor?.selectionModel
        val startLine: Int?
        val endLine: Int?
        val selectedText: String?
        if (selectionModel != null && selectionModel.hasSelection() && selectionModel.selectedText != null) {
            // Editor positions are 0-based; the payload uses 1-based line numbers.
            startLine = selectionModel.selectionStartPosition?.line?.plus(1)
            endLine = selectionModel.selectionEndPosition?.line?.plus(1)
            selectedText = selectionModel.selectedText
        } else {
            startLine = null
            endLine = null
            selectedText = null
        }

        // Deduplication: skip if this (path, startLine, endLine) was just sent.
        val key = Triple(absolutePath, startLine, endLine)
        if (key == lastDispatched) return
        lastDispatched = key

        val gitignored = isVcsIgnored(project, vFile)

        val payload = EditorContextPayload.buildSelectionPayload(
            absolutePath = absolutePath,
            relativePath = relativePath,
            startLine = startLine,
            endLine = endLine,
            selectedText = selectedText,
            workingDir = workingDir,
            isGitignored = gitignored
        )

        val backendKey = workingDir ?: return
        val backend = NodeBackendService.getInstance()

        ioScope.launch {
            try {
                val port = backend.awaitPort(backendKey)
                // /internal routes require the stable token (Phase 1 defense-in-depth).
                postIdeSelection(port, payload.toString(), backend.authToken(backendKey))
            } catch (ex: Exception) {
                logger.debug("ide-selection dispatch failed (no backend yet or error): ${ex.message}")
            }
        }
    }

    /**
     * Fire-and-forget HTTP POST to `/internal/ide-selection`.
     *
     * Runs on [ioScope] (never the EDT). Short timeouts are intentional — this is
     * a passive channel and must not block the IDE if the backend is slow.
     *
     * [authToken] is the backend's stable control-channel token; sent in the
     * `x-ccg-token` header the backend requires on the /internal routes (never logged).
     */
    private fun postIdeSelection(port: Int, jsonBody: String, authToken: String?) {
        val url = URI("http://127.0.0.1:$port/internal/ide-selection").toURL()
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 1000
            conn.readTimeout = 1000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            // Custom header (mirrors backend HTTP_AUTH_HEADER) — chosen over
            // Authorization to avoid clashing with Claude's own auth / proxy rewrites.
            if (!authToken.isNullOrEmpty()) conn.setRequestProperty("x-ccg-token", authToken)
            conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            logger.debug("POST /internal/ide-selection returned HTTP $code")
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Returns true when [vFile] is ignored by the VCS configured for [project]
     * (i.e. would be excluded by .gitignore or equivalent).
     *
     * Uses [ChangeListManager.isIgnoredFile], a public, non-deprecated,
     * non-internal API available since IntelliJ Platform 2024.2.
     *
     * Called from the alarm callback on the EDT; ChangeListManager.isIgnoredFile
     * reads from an in-memory cache and is safe to call on the EDT without any
     * extra ReadAction wrapper.
     *
     * Returns false when VCS is not configured for the project or when any
     * unexpected error occurs.
     */
    private fun isVcsIgnored(project: Project, vFile: VirtualFile): Boolean {
        return try {
            ChangeListManager.getInstance(project).isIgnoredFile(vFile)
        } catch (_: Exception) {
            false
        }
    }

    /** Debounce window in milliseconds. */
    const val DEBOUNCE_MS: Int = 200
}
