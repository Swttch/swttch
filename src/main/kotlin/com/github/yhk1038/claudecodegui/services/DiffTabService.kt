package com.github.yhk1038.claudecodegui.services

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project

/**
 * Opens and closes editor tabs that host OUR diff page.
 *
 * ## Why this is not [DiffService]
 *
 * [DiffService] hands a change to the IDE's own diff viewer and gets an answer
 * back through the controls it installs. This does neither: it opens a tab
 * pointed at a WebView route and stops there. The page inside fetches the change
 * and answers over the backend's own messages, exactly as it does in a browser —
 * so the IDE never sees the content at all.
 *
 * ## Why the tab is not registered with [EditorTabStateService]
 *
 * A chat tab is worth restoring after a restart; a review is not. It exists to
 * answer one permission request, and that request is long gone by the next
 * launch — the CLI process that asked it does not survive either. A restored
 * diff tab would come back pointing at a tool call nobody is waiting on, which
 * is the "already answered" screen at best.
 *
 * Registration is what would cause that: [EditorTabStateService] is the record
 * the platform's restore consults for a tab's address and title. Staying out of
 * it means a diff tab is simply not part of the next session. The platform may
 * still persist the tab's URL in its own layout; a tab revived that way resolves
 * to a page that reports the request is no longer pending, and closes.
 */
@Service(Service.Level.PROJECT)
class DiffTabService(private val project: Project) {

    private val logger = Logger.getInstance(DiffTabService::class.java)

    /**
     * Open (or focus) the review tab for [toolUseId].
     *
     * The tab id is derived from the tool call rather than minted fresh, so a
     * second request for the same review focuses the tab already showing it
     * instead of opening a duplicate — and so [close] can find it later without
     * a lookup table to keep in sync.
     */
    fun open(toolUseId: String) {
        // Must run on the EDT: the platform resolves the target splitter through
        // the focus owner. requestOpenFile itself does not block — the whole
        // reason chat tabs use it (see EditorTabHost).
        ApplicationManager.getApplication().invokeLater {
            val file = ClaudeCodeVirtualFile.getOrCreate(
                project,
                tabIdFor(toolUseId),
                initialPath = diffPathFor(toolUseId),
                initialTitle = REVIEW_TAB_TITLE,
            )
            FileEditorManager.getInstance(project).requestOpenFile(file)
            logger.info("Opened diff review tab (toolUseId=$toolUseId)")
        }
    }

    /**
     * Close the review tab for [toolUseId].
     *
     * A no-op when no such tab is open, which is the ordinary case: the backend
     * tells both review surfaces to close on every answer rather than remembering
     * which one a request opened.
     */
    fun close(toolUseId: String) {
        val tabId = tabIdFor(toolUseId)
        val file = ClaudeCodeVirtualFile.findExisting(tabId) ?: return

        ApplicationManager.getApplication().invokeLater {
            FileEditorManager.getInstance(project).closeFile(file)
            // The panel's own dispose releases the browser; this drops the file
            // so a later request with the same id starts clean rather than
            // reusing a tab the user has already seen closed.
            ClaudeCodeVirtualFile.removeTab(project, tabId)
            logger.info("Closed diff review tab (toolUseId=$toolUseId)")
        }
    }

    companion object {
        fun getInstance(project: Project): DiffTabService = project.getService(DiffTabService::class.java)

        /**
         * Label the tab wears until the page reports its own.
         *
         * The page names itself after the file under review, through
         * `document.title` — which is where this tab reads its label from once
         * the WebView is up (see ClaudeCodeFileEditor). This is only the first
         * paint, and it must say the same thing the page will: the file is not
         * known yet at open time, because the tab is addressed by tool call and
         * fetches the change itself.
         */
        private const val REVIEW_TAB_TITLE = "Diff view"

        /**
         * Tab id for the review of [toolUseId].
         *
         * Prefixed rather than used bare so a review tab can never collide with a
         * chat tab, whose ids are UUIDs.
         */
        private fun tabIdFor(toolUseId: String): String = "diff-$toolUseId"

        /**
         * The WebView route the tab lands on. Must match the webview's own
         * `diffToPath` — the two sides address the same page.
         */
        private fun diffPathFor(toolUseId: String): String = "/diff/$toolUseId"
    }
}
