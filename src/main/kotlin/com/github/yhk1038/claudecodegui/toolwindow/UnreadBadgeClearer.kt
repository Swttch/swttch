package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.editor.TabBadge
import com.github.yhk1038.claudecodegui.hosting.ToolWindowHost
import com.intellij.openapi.application.ApplicationActivationListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.IdeFrame
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener

/**
 * Takes an unread badge off when the user arrives at the session it was drawn for.
 *
 * A badge is drawn when a turn ends on a session the user is not looking at (see
 * [SessionViewJudge]), and that now includes a session on a tab that is selected while
 * the IDE is in the background. Arriving there fires no tab selection event, so without
 * this the dot would stay on a session the user is already reading.
 *
 * Two arrivals are covered, besides selecting the tab, which the hosts handle themselves:
 * the IDE window gaining focus ([OnIdeActivated]) and the tool window being shown
 * ([OnToolWindowShown]).
 */
object UnreadBadgeClearer {

    /** Must run on the EDT. */
    fun clear(project: Project) {
        if (project.isDisposed) return
        val manager = FileEditorManager.getInstance(project)
        var changed = false
        for (file in manager.openFiles) {
            if (file !is ClaudeCodeVirtualFile || !file.badgeState.clearedBySelection) continue
            if (SessionViewJudge.isViewing(project, file.tabId) && file.setBadge(TabBadge.NONE)) {
                changed = true
            }
        }
        if (changed) (manager as? FileEditorManagerEx)?.refreshIcons()
        ToolWindowHost.getInstance(project).clearUnreadWhereViewed()
    }
}

/** The IDE window regained focus. */
class OnIdeActivated : ApplicationActivationListener {
    override fun applicationActivated(ideFrame: IdeFrame) {
        val project = ideFrame.project ?: return
        // Focus is not yet reported by the frame in the callback itself.
        ApplicationManager.getApplication().invokeLater { UnreadBadgeClearer.clear(project) }
    }
}

/** The tool window was shown, which can bring a selected tab on screen. */
class OnToolWindowShown : ToolWindowManagerListener {
    override fun stateChanged(toolWindowManager: ToolWindowManager) {
        val tw = toolWindowManager.getToolWindow(ToolWindowHost.TOOL_WINDOW_ID) ?: return
        if (!tw.isVisible) return
        ApplicationManager.getApplication().invokeLater { UnreadBadgeClearer.clear(tw.project) }
    }
}
