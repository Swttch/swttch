package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.jdom.Element

class ClaudeCodeEditorProvider : FileEditorProvider, DumbAware {

    override fun accept(project: Project, file: VirtualFile): Boolean {
        return file is ClaudeCodeVirtualFile
    }

    /**
     * Build the pane, and tie a restored tab to its project on the way.
     *
     * A tab revived by the platform's layout restore is created before any
     * project is open (issue #312), so it arrives here bare: no owner, no
     * conversation, the generic label. This is the first moment a [Project] is
     * in hand, so it is where the tab is claimed and filled in from
     * [EditorTabStateService]. Both calls are no-ops for a tab that was opened
     * normally, which already has all three.
     */
    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        val chatTab = file as ClaudeCodeVirtualFile
        ClaudeCodeVirtualFile.claim(project, chatTab.tabId)

        val state = EditorTabStateService.getInstance(project)
        chatTab.seedRestoredState(state.getPath(chatTab.tabId), state.getTitle(chatTab.tabId))

        return ClaudeCodeFileEditor(project, chatTab)
    }

    override fun getEditorTypeId(): String = "ClaudeCodeEditor"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    /**
     * Restore the address THIS pane was showing.
     *
     * The platform stores one state per editor, so each half of a split gets its
     * own entry in the layout and comes back where it was — instead of both panes
     * reading the single slot that used to live on the shared virtual file.
     */
    override fun readState(
        sourceElement: Element,
        project: Project,
        file: VirtualFile,
    ): FileEditorState = ClaudeCodeEditorState.readFrom(sourceElement)

    override fun writeState(state: FileEditorState, project: Project, targetElement: Element) =
        ClaudeCodeEditorState.writeTo(state, targetElement)
}
