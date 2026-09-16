package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.vfs.VirtualFile

/**
 * Clears the unread badge when a Claude Code tab becomes selected.
 *
 * Session/browser cleanup on tab close is intentionally NOT done here.
 * JetBrains fires `fileClosed` on BOTH a real tab close AND a tab move/split,
 * so releasing the pooled JCEF browser from `fileClosed` destroyed it during a
 * move and forced a full reload (issue #29). Cleanup now lives in
 * [com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel.dispose] via
 * [com.github.yhk1038.claudecodegui.services.ClaudeCodeBrowserService.releaseRef],
 * which distinguishes a real close from a move/split by reference counting.
 */
class ClaudeCodeEditorManagerListener : FileEditorManagerListener {

    override fun selectionChanged(event: FileEditorManagerEvent) {
        val file = event.newFile
        if (file is ClaudeCodeVirtualFile && file.badgeState.clearedBySelection) {
            if (file.setBadge(TabBadge.NONE)) {
                (event.manager as? FileEditorManagerEx)?.refreshIcons()
            }
        }
    }

    /**
     * When a Claude Code tab closes, IDE selects the next editor but often restores
     * keyboard focus to the left session tool window — it was the last focused
     * component before the tab was opened (sessions open from that tool window).
     * That leaves focus on the tool window instead of another editor. Redirect focus
     * to the now-selected editor so closing a chat tab returns focus to a sibling
     * editor (e.g. the code editor the user was in), not the tool window.
     *
     * fileClosed also fires on tab move/split; redirecting to the selected editor is
     * harmless there (focus belongs on that editor anyway). Gated on isShowing.
     */
    override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
        if (file !is ClaudeCodeVirtualFile) return
        ApplicationManager.getApplication().invokeLater {
            val target = source.selectedEditor?.preferredFocusedComponent ?: return@invokeLater
            if (target.isShowing) target.requestFocusInWindow()
        }
    }
}
