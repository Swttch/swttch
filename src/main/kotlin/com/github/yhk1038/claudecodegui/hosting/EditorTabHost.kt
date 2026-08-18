package com.github.yhk1038.claudecodegui.hosting

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project

/**
 * Hosts chat sessions in IDE **editor tabs** — the original behaviour, now
 * expressed through the [ChatHost] contract.
 *
 * Opening is this host's job; restoring after a restart is not. Chat tabs are
 * ordinary URL-addressable files to the platform, so it reopens them — in their
 * original splitters — as part of its own editor layout restore. See
 * [restorePersistedSessions].
 */
object EditorTabHost : ChatHost {

    private val logger = Logger.getInstance(EditorTabHost::class.java)

    override fun openOrFocus(project: Project, tabId: String, initialPath: String?, initialTitle: String?) {
        // Must run on the EDT (the platform resolves the active splitter via the
        // focus owner). requestOpenFile itself does NOT block — see [doOpenOrFocus].
        ApplicationManager.getApplication().invokeLater {
            doOpenOrFocus(project, tabId, initialPath, initialTitle)
        }
    }

    /**
     * Opens-or-focuses the tab without freezing the EDT.
     *
     * The deprecated synchronous `openFile(file, focusEditor)` ran
     * `blockingWaitForCompositeFileOpen`, pumping the EDT until the whole
     * composite (our JCEF panel) was ready — which froze the IDE for 60–85s on
     * startup tab restore (#110). Merely wrapping that call in `invokeLater` did
     * NOT help (it still blocked the EDT — the v0.8.3 regression).
     *
     * `requestOpenFile` opens with `waitForCompositeOpen = false`, so the EDT
     * only does the cheap composite creation and never waits for the heavy load.
     * It is a public `@ApiStatus.Experimental` API, so this stays clear of any
     * `@ApiStatus.Internal` type (notably `FileEditorOpenOptions`). The tab is
     * still made current (`selectAsCurrent`); keyboard focus is taken by the
     * WebView itself in `ClaudeCodePanel` once it is showing.
     */
    private fun doOpenOrFocus(project: Project, tabId: String, initialPath: String?, initialTitle: String?) {
        val fileEditorManager = FileEditorManager.getInstance(project)
        val virtualFile = ClaudeCodeVirtualFile.getOrCreate(project, tabId, initialPath, initialTitle)

        // Already-open tab (same cached virtual file) → focus; otherwise open a new one.
        fileEditorManager.requestOpenFile(virtualFile)

        // Persist tab state.
        EditorTabStateService.getInstance(project).addTab(tabId)
    }

    /**
     * Restore is the IDE's job here, so this deliberately opens nothing.
     *
     * The platform already persists the full editor layout — which splitter each
     * tab sits in, the split orientation and proportion — and reopens it on the
     * next start. Since chat tabs are addressable by URL
     * ([com.github.yhk1038.claudecodegui.editor.ClaudeCodeFileSystem]), they take
     * part in that restore like any other file, splitter placement included.
     *
     * Reopening them ourselves on top of that is what broke it (#302). This ran
     * ~2s after the platform's own restore and called `requestOpenFile`, which
     * targets the *active* splitter rather than the tab's remembered one — so a
     * tab the user had split to the right came back in the default pane. The log
     * showed the whole sequence: the platform restoring, then us reopening, which
     * is the "tab flashes closed, then re-opens in the default location" in the
     * report.
     *
     * What the platform cannot know is *which conversation* a tab was showing and
     * what its label was. That still comes from
     * [com.github.yhk1038.claudecodegui.services.EditorTabStateService] — read
     * during URL resolution, so a platform-restored tab is materialized with its
     * path and title already in place.
     *
     * [ToolWindowHost] keeps its own restore: tool-window content tabs are not
     * files, so the platform does not reopen them.
     */
    override fun restorePersistedSessions(project: Project) {
        logger.info("Editor tabs are restored by the IDE (layout + splitters); skipping plugin-side restore")
    }
}
