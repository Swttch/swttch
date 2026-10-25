package com.github.yhk1038.claudecodegui.platform

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.TimeUnit

/**
 * Reads which editor pane a chat tab is in, and moves a tab to another pane.
 *
 * The IDE offers no public way to ask for the panes of the editor area: the type
 * that models one lives in an `impl` package, which this plugin does not use. So
 * the panes are read by method name only, the same way [EditorOpener] reaches
 * `requestOpenFile`, and moving a tab goes through two public editor actions the
 * user has in the tab menu. Every step is allowed to fail: when the IDE does not
 * answer as expected the tabs simply stay in the pane they were opened in.
 */
object EditorPanes {
    private val logger = Logger.getInstance(EditorPanes::class.java)

    private const val SPLIT_AND_MOVE_RIGHT = "MoveTabRight"
    private const val MOVE_TO_OPPOSITE_PANE = "MoveEditorToOppositeTabGroup"

    /** Index of the pane each open chat tab is in, keyed by tab id. Empty when the panes cannot be read. */
    fun paneIndexByTabId(project: Project): Map<String, Int> {
        val windows = windowsOf(project) ?: return emptyMap()
        val result = LinkedHashMap<String, Int>()
        windows.forEachIndexed { index, window ->
            for (file in filesOf(window)) {
                if (file is ClaudeCodeVirtualFile) result[file.tabId] = index
            }
        }
        return result
    }

    /**
     * Moves each tab in [tabIds] out of the first pane, one after another. Runs
     * later and step by step because a reopened tab is only an editor a moment
     * after it was requested, and an action needs the tab to be the selected one.
     */
    fun moveToSecondPane(project: Project, tabIds: List<String>) {
        if (tabIds.isEmpty()) return
        AppExecutorUtil.getAppScheduledExecutorService().schedule({
            ApplicationManager.getApplication().invokeLater({ step(project, tabIds.iterator()) }, project.disposed)
        }, FIRST_DELAY_MS, TimeUnit.MILLISECONDS)
    }

    private fun step(project: Project, remaining: Iterator<String>) {
        if (project.isDisposed || !remaining.hasNext()) return
        val tabId = remaining.next()
        val file = ClaudeCodeVirtualFile.findExisting(tabId)
        // Already outside the first pane (or not there to move): nothing to do.
        if (file == null || (paneIndexByTabId(project)[tabId] ?: 0) >= 1) {
            next(project, remaining)
            return
        }
        val manager = FileEditorManager.getInstance(project)
        EditorOpener.requestOpenFile(manager, file)
        AppExecutorUtil.getAppScheduledExecutorService().schedule({
            ApplicationManager.getApplication().invokeLater({
                moveSelectedTab(project, file)
                next(project, remaining)
            }, project.disposed)
        }, SELECT_DELAY_MS, TimeUnit.MILLISECONDS)
    }

    private fun next(project: Project, remaining: Iterator<String>) {
        AppExecutorUtil.getAppScheduledExecutorService().schedule({
            ApplicationManager.getApplication().invokeLater({ step(project, remaining) }, project.disposed)
        }, STEP_DELAY_MS, TimeUnit.MILLISECONDS)
    }

    private fun moveSelectedTab(project: Project, file: VirtualFile) {
        val manager = FileEditorManager.getInstance(project)
        val component = manager.selectedEditor?.component ?: return
        val paneCount = windowsOf(project)?.size ?: 1
        val actionId = if (paneCount >= 2) MOVE_TO_OPPOSITE_PANE else SPLIT_AND_MOVE_RIGHT
        val invoked = PlatformActionInvoker.invokeActionById(actionId, component, "SwttchRestoreChatTabs")
        logger.info("Moving chat tab ${file.name} to the second pane with $actionId: invoked=$invoked")
    }

    private fun windowsOf(project: Project): List<Any>? =
        try {
            val manager = FileEditorManager.getInstance(project)
            val windows = manager.javaClass.getMethod("getWindows").invoke(manager) as? Array<*>
            windows?.filterNotNull()
        } catch (e: ReflectiveOperationException) {
            logger.info("Editor panes are not readable in this IDE: ${e.javaClass.simpleName}")
            null
        } catch (e: ClassCastException) {
            null
        }

    private fun filesOf(window: Any): List<VirtualFile> {
        for (name in listOf("getFileList", "getFiles")) {
            try {
                val value = window.javaClass.getMethod(name).invoke(window)
                val files = when (value) {
                    is Array<*> -> value.toList()
                    is Collection<*> -> value.toList()
                    else -> continue
                }
                return files.filterIsInstance<VirtualFile>()
            } catch (_: ReflectiveOperationException) {
                // try the next name
            }
        }
        return emptyList()
    }

    private const val FIRST_DELAY_MS = 2500L
    private const val SELECT_DELAY_MS = 600L
    private const val STEP_DELAY_MS = 600L
}
