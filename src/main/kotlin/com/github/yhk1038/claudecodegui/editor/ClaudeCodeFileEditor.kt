package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class ClaudeCodeFileEditor(
    private val project: Project,
    private val virtualFile: ClaudeCodeVirtualFile
) : UserDataHolderBase(), FileEditor {

    /**
     * The address THIS pane is showing, kept per editor rather than on the shared
     * [ClaudeCodeVirtualFile] (see [ClaudeCodeEditorState]).
     *
     * Seeded from the file so a newly split pane starts on the same conversation
     * as the pane it was split from, then diverges as this pane navigates.
     */
    @Volatile
    private var panePath: String? = virtualFile.currentPath ?: virtualFile.initialPath

    /**
     * Built on first access rather than in the constructor, because the platform
     * calls [setState] with this pane's restored address AFTER creating the
     * editor. Constructing the panel eagerly would load the seed address and then
     * ignore the restored one, so a restored split would put both panes on the
     * same conversation — the very thing this is fixing.
     */
    private val panel: ClaudeCodePanel by lazy {
        ClaudeCodePanel(project, virtualFile.tabId, panePath).also { created ->
            Disposer.register(this, created)
            attachPanelCallbacks(created)
        }
    }

    @Volatile
    private var wasStreaming: Boolean = false

    private fun attachPanelCallbacks(panel: ClaudeCodePanel) {

        // WebView의 title 변경을 VirtualFile에 전달 + 영속 저장소에도 캐싱.
        // IDE 재시작 후 lazy mount 단계에서 마지막으로 본 제목을 즉시 보여 주기 위함.
        //
        // 부트 placeholder 제거: index.html의 <title>이 빈 문자열이므로
        // ClaudeCodePanel의 isNotBlank 가드가 자동으로 차단함. 여기서 별도로 거르지 않음.
        panel.onTitleChanged = { title ->
            virtualFile.setDisplayName(title)
            EditorTabStateService.getInstance(project).updateTitle(virtualFile.tabId, title)
        }

        // Navigation belongs to THIS pane: record it here so a split whose panes
        // have moved apart keeps two addresses instead of overwriting one shared
        // slot (which also dragged the other pane's tab title along with it).
        //
        // The file and the persisted state are still updated, because they are what
        // seeds a pane that has no state of its own yet — a brand-new tab, or the
        // tool-window host, which is not split and has no per-editor state.
        panel.onPathChanged = { path ->
            panePath = path
            virtualFile.currentPath = path
            EditorTabStateService.getInstance(project).updatePath(virtualFile.tabId, path)
        }

        // Streaming state change: show unread badge when streaming ends on inactive tab
        panel.onStreamingStateChanged = { isStreaming ->
            if (!isStreaming && wasStreaming) {
                if (!isTabActive()) {
                    if (virtualFile.setBadge(TabBadge.UNREAD)) {
                        FileEditorManagerEx.getInstanceEx(project).refreshIcons()
                    }
                }
            }
            wasStreaming = isStreaming
        }
    }

    private fun isTabActive(): Boolean {
        val fem = FileEditorManager.getInstance(project)
        return fem.selectedEditors.any { it === this }
    }

    override fun getComponent(): JComponent = panel

    override fun getPreferredFocusedComponent(): JComponent = panel

    override fun getName(): String = virtualFile.presentableName

    override fun getFile(): VirtualFile = virtualFile

    override fun isValid(): Boolean = true

    override fun isModified(): Boolean = false

    /**
     * This pane's address, so the platform persists it per editor and hands it
     * back to [setState] on restore. Two panes of one split therefore keep two
     * addresses — like two browser tabs on the same page that have since been
     * navigated apart.
     */
    override fun getState(level: FileEditorStateLevel): FileEditorState =
        ClaudeCodeEditorState(panePath)

    override fun setState(state: FileEditorState) {
        val path = (state as? ClaudeCodeEditorState)?.path ?: return
        panePath = path
        // Once the panel exists it owns the address — its WebView has its own
        // history and re-pointing it here would yank the user out of wherever they
        // navigated. This only seeds the address for the panel yet to be built.
    }

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun dispose() {
        // NOTE: removeSession/removeTab은 여기서 호출하지 않음.
        // 탭 이동/분할 시에도 dispose()가 호출되기 때문에,
        // 실제 탭 닫기는 ClaudeCodeEditorManagerListener.fileClosed()에서 처리.
        // panel은 Disposer에 의해 자동으로 dispose됨.
    }
}
