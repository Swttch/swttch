package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.hosting.ToolWindowHost
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.WindowManager

/**
 * Where one session is, relative to what the user is looking at right now.
 *
 * A session lives in exactly one of two places: an editor tab, or a tab of the
 * "Claude Code" tool window. Both are read here so that the two places are never
 * asked about separately by their callers.
 */
data class SessionPlacement(
    val editorTabSelected: Boolean,
    val toolWindowVisible: Boolean,
    val toolWindowTabSelected: Boolean,
)

/**
 * The one place that answers "is the user looking at this session" (#583).
 *
 * The unread badge on a tab and the attention banner ask the same question and get the
 * same answer: the session is being looked at when it is on the tab that is selected
 * where it lives (an editor tab, or a tab of the "Claude Code" tool window), the tool
 * window is on screen if that is where it lives, and the IDE window has focus. Only a
 * session that is NOT being looked at needs attention, so only then is a badge drawn
 * and a banner raised.
 *
 * What the two still decide for themselves is not about looking. The banner also obeys
 * the user's notification setting, which the backend reads before the IDE is asked; the
 * badge has no such setting.
 *
 * Before this, the badge asked the editor tab host and the tool window host each in
 * their own words, and the banner asked only about editor tabs, so a session hosted
 * in the tool window raised a banner over the chat the user was typing in.
 *
 * A badge drawn while the user was away has to come off when the user comes back, and
 * selecting the tab is no longer the only way of coming back: the IDE regaining focus
 * or the tool window being shown does it too. [UnreadBadgeClearer] listens for those.
 */
object SessionViewJudge {

    fun isViewing(placement: SessionPlacement, ideFocused: Boolean): Boolean {
        val onScreen = placement.editorTabSelected ||
            (placement.toolWindowVisible && placement.toolWindowTabSelected)
        return onScreen && ideFocused
    }

    /** Whether the IDE window of [project] has focus. Must run on the EDT. */
    fun ideFocused(project: Project): Boolean =
        WindowManager.getInstance().getFrame(project)?.isActive == true

    /** Reads the IDE and answers [isViewing] for [tabId]. Must run on the EDT. */
    fun isViewing(project: Project, tabId: String): Boolean =
        isViewing(read(project, tabId), ideFocused(project))

    /** Reads where [tabId] is. Must run on the EDT. */
    fun read(project: Project, tabId: String): SessionPlacement {
        val editorTabSelected = FileEditorManager.getInstance(project).selectedEditors.any {
            (it.file as? ClaudeCodeVirtualFile)?.tabId == tabId
        }
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(ToolWindowHost.TOOL_WINDOW_ID)
        return SessionPlacement(
            editorTabSelected = editorTabSelected,
            toolWindowVisible = toolWindow?.isVisible == true,
            toolWindowTabSelected = toolWindow?.contentManager?.selectedContent
                ?.getUserData(ToolWindowHost.TAB_ID_KEY) == tabId,
        )
    }
}
