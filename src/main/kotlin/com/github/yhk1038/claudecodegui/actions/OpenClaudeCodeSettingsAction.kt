package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeFileEditor
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager

/**
 * Action to open Claude Code settings in a new editor tab.
 *
 * Only enabled when a Claude Code editor is currently focused.
 * This overrides IntelliJ's default ShowSettings action (Cmd+,) in that context.
 *
 * Keyboard shortcuts:
 * - Mac: Cmd+,
 * - Windows/Linux: Ctrl+,
 */
class OpenClaudeCodeSettingsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        OpenClaudeCodeAction.openTab(project, "/settings/general")
    }

    override fun update(e: AnActionEvent) {
        val project = e.project
        if (project == null) {
            e.presentation.isEnabledAndVisible = false
            return
        }

        // Only enable when Claude Code editor is focused
        val editor = FileEditorManager.getInstance(project).selectedEditor
        e.presentation.isEnabledAndVisible = editor is ClaudeCodeFileEditor
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}
