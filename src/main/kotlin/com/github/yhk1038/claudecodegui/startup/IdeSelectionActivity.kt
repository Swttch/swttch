package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.editor.IdeSelectionDispatcher
import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.SelectionModel
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.util.Disposer

/**
 * Registers two passive IDE-event listeners for the auto-selection channel:
 *
 * 1. **[SelectionListener]** — fires when the user drags to select text inside
 *    any open editor. Registered via [EditorFactory.getEventMulticaster] so it
 *    covers every editor (including those opened after project load).
 *
 * 2. **[FileEditorManagerListener]** — fires when the user switches to a
 *    different editor tab. Dispatches the new file's current selection (usually
 *    empty on a plain tab switch).
 *
 * Both listeners delegate to [IdeSelectionDispatcher.scheduleDispatch] which
 * applies gating, debouncing, and deduplication before POSTing to the backend's
 * `/internal/ide-selection` endpoint.
 *
 * Lifecycle: both listeners are tied to a [Disposable] that is a child of the
 * project, so they are automatically removed when the project closes.
 */
class IdeSelectionActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        // Create a Disposable child of the project so all registrations are
        // cleaned up automatically when the project closes.
        val disposable = Disposer.newDisposable("IdeSelectionActivity[$project]")
        Disposer.register(project, disposable)

        registerSelectionListener(project, disposable)
        registerTabSwitchListener(project, disposable)
    }

    /**
     * Registers a [SelectionListener] on the global event multicaster.
     *
     * The listener fires on every selection change in every editor. Gating,
     * debouncing, and deduplication are handled by [IdeSelectionDispatcher].
     */
    private fun registerSelectionListener(project: Project, disposable: Disposable) {
        EditorFactory.getInstance().eventMulticaster.addSelectionListener(
            object : SelectionListener {
                override fun selectionChanged(e: SelectionEvent) {
                    val editor = e.editor
                    val vFile = FileEditorManager.getInstance(project)
                        .selectedEditor
                        ?.file
                        ?: return
                    // Skip synthetic events from the Claude panel's JCEF editor.
                    if (vFile is ClaudeCodeVirtualFile) return
                    IdeSelectionDispatcher.scheduleDispatch(project, editor, vFile)
                }
            },
            disposable
        )
    }

    /**
     * Registers a [FileEditorManagerListener] via the project message bus so tab
     * switches trigger an auto-dispatch even when the selection hasn't changed.
     *
     * On a plain tab switch the editor's selection is usually empty, which causes
     * [IdeSelectionDispatcher] to send `startLine/endLine/selectedText = null` —
     * signalling to the backend "user is now viewing this file".
     */
    private fun registerTabSwitchListener(project: Project, disposable: Disposable) {
        project.messageBus.connect(disposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    val newFile = event.newFile
                    // Skip the Claude panel itself.
                    if (newFile is ClaudeCodeVirtualFile) return
                    // A null newFile means the last tab just closed. Dispatch it
                    // rather than returning: nothing else will fire afterwards,
                    // so bailing out here left the composer's context chip
                    // naming a tab that is gone — which is what happened to the
                    // review diff opened for a proposed edit.
                    val editor = FileEditorManager.getInstance(project)
                        .selectedTextEditor
                    IdeSelectionDispatcher.scheduleDispatch(project, editor, newFile)
                }
            }
        )
    }
}
