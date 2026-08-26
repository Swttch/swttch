package com.github.yhk1038.claudecodegui.hosting

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware

/**
 * "Rename Session..." on the right-click menu of a chat tab in EDITOR_TAB mode.
 *
 * The twin of [RenameChatTabAction], which does the same thing for a tool-window
 * tab. Two actions rather than one because the platform exposes the two menus
 * separately — `EditorTabPopupMenu` hands over the clicked file, while
 * `ToolWindowContextMenu` hands over a `Content` — so only the way a tab is
 * identified differs. Everything after that is [RenameChatTabAction.requestRename].
 *
 * This is the mode most people are in: EDITOR_TAB is the default, so an action
 * registered only on the tool-window menu would leave the feature unreachable
 * for them (issue #301).
 */
class RenameChatEditorTabAction : AnAction(), DumbAware {

    override fun update(event: AnActionEvent) {
        // Only on our own tabs: this menu belongs to every editor tab, and the
        // entry has no meaning over a source file.
        event.presentation.isEnabledAndVisible = chatTabOf(event) != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val chatTab = chatTabOf(event) ?: return
        // presentableName is the label the tab is showing, whether that came from
        // a name of the user's own or from the conversation.
        RenameChatTabAction.requestRename(project, chatTab.tabId, chatTab.presentableName)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    /** The chat tab the menu was opened on, or null when it was some other file. */
    private fun chatTabOf(event: AnActionEvent): ClaudeCodeVirtualFile? =
        event.getData(CommonDataKeys.VIRTUAL_FILE) as? ClaudeCodeVirtualFile
}
