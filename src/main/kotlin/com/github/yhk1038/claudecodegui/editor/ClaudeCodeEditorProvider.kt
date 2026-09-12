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

        seedFromPersistedState(project, chatTab)

        return ClaudeCodeFileEditor(project, chatTab)
    }

    /**
     * Fill a restored tab in from [EditorTabStateService] without ever being the
     * thread that creates that service.
     *
     * This method runs on the EDT, and creating [EditorTabStateService] there
     * throws on a WSL project — the reason is spelled out on
     * [EditorTabStateService.getInstanceIfCreated] (issue #438). The layout
     * restore is the one path that can reach this before the project has finished
     * opening, so it is also the one path where the service may genuinely not
     * exist yet.
     *
     * When it does not, the read moves to a background thread and the seed is
     * applied when it comes back. Arriving late costs nothing: the tab shows its
     * generic label for a moment longer, and
     * [ClaudeCodeVirtualFile.seedRestoredState] only fills in what is still
     * unset, so a pane whose real address arrived first (via `readState` →
     * `setState`) keeps it.
     */
    private fun seedFromPersistedState(project: Project, chatTab: ClaudeCodeVirtualFile) {
        EditorTabStateService.useFromEdt(project) { state ->
            chatTab.seedRestoredState(state.getPath(chatTab.tabId), state.getEffectiveTitle(chatTab.tabId))
        }
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
