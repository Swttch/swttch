package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeFileEditor
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.util.SystemInfo
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import java.util.UUID

/**
 * True when this action is being triggered by a Ctrl-without-Meta key chord on macOS.
 *
 * On macOS, Ctrl+N is the Emacs "next line" key, which the chat input supports (issue #506).
 */
internal fun yieldsToEmacsTextKey(isMac: Boolean, inputEvent: InputEvent?): Boolean =
    isMac && inputEvent is KeyEvent && inputEvent.isControlDown && !inputEvent.isMetaDown

/**
 * Action to open a new Claude Code editor tab.
 *
 * Only enabled when a Claude Code editor is currently focused.
 * Keyboard shortcuts:
 * - Mac: Cmd+N
 * - Windows/Linux: Ctrl+N
 *
 * The `$default` keymap is inherited by the macOS keymaps, so a physical Ctrl+N would also
 * fire this action on macOS and the IDE would consume the keystroke before it reaches the
 * page. Ctrl+N is the Emacs "next line" key there (issue #506), so on macOS the action
 * declines Ctrl-without-Meta key chords and lets the keystroke fall through to the page.
 * Cmd+N, menu/toolbar invocations and Windows/Linux Ctrl+N are unchanged.
 */
class NewClaudeCodeTabAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        OpenClaudeCodeAction.openTab(project, UUID.randomUUID().toString())
    }

    override fun update(e: AnActionEvent) {
        val project = e.project
        if (project == null) {
            e.presentation.isEnabledAndVisible = false
            return
        }

        if (yieldsToEmacsTextKey(SystemInfo.isMac, e.inputEvent)) {
            e.presentation.isEnabledAndVisible = false
            return
        }

        // Only enable when Claude Code editor is focused
        val editor = FileEditorManager.getInstance(project).selectedEditor
        e.presentation.isEnabledAndVisible = editor is ClaudeCodeFileEditor
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}
