package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import org.jdom.Element

/**
 * The address one chat pane is showing.
 *
 * A split gives each pane its own [ClaudeCodeFileEditor] and its own WebView, and
 * from then on each navigates independently — the same way two browser tabs on
 * one page drift apart once you click around in one of them. So "which
 * conversation am I showing" belongs to the pane, not to the file the panes have
 * in common.
 *
 * It used to live on the shared [ClaudeCodeVirtualFile] (as `currentPath`), which
 * is one slot for however many panes exist. Whichever pane navigated last
 * overwrote it, and the other pane — sitting untouched — was left pointing at its
 * neighbour's address, which is why its tab renamed itself along with the pane
 * that had actually moved.
 *
 * The platform already keeps one [FileEditorState] per editor and writes it into
 * the editor layout beside that pane's `<provider>` entry, so this both fixes the
 * sharing and restores each pane where it was.
 *
 * ## Known limitation: the tab TITLE is still shared
 *
 * The address is per pane now, but the label above it is not: the platform
 * derives a tab's title from its FILE
 * (`EditorTabPresentationUtil.getEditorTabTitle(Project, VirtualFile)` →
 * `EditorTabTitleProvider`, neither of which is given the FileEditor). One file
 * can therefore only ever show one title, so navigating in one pane of a split
 * still renames both tabs. A tab opened with "+" is unaffected — it gets its own
 * file.
 *
 * Splitting the title would mean one file per pane, and every stable route there
 * is closed. Verified against the 2024.2 platform:
 *
 *  - overriding `FileEditor.getName()` — never consulted for the tab label;
 *  - swapping the duplicate pane's file — `FileEditorManager.closeFile(file)`
 *    closes it in EVERY pane, and the pane-scoped overloads plus
 *    `createSplitter` take `EditorWindow`, which is `@ApiStatus.Internal`;
 *  - intercepting the split action — `SplitAction` is an
 *    `ActionRemoteBehaviorSpecification.Frontend`, so it never reaches an
 *    `AnActionListener` on this side (confirmed by a run where the split
 *    happened and the listener logged nothing);
 *  - `SplitAction.FORBID_TAB_SPLIT` — hides the split action entirely, which
 *    removes the feature instead of fixing it.
 */
data class ClaudeCodeEditorState(val path: String?) : FileEditorState {

    /**
     * Never merge. Merging is for states that are "close enough" to be treated as
     * one navigation step (a caret moving within a file); two panes showing two
     * different conversations are not that, and letting them merge would put the
     * shared-slot bug back.
     */
    override fun canBeMergedWith(otherState: FileEditorState, level: FileEditorStateLevel): Boolean = false

    companion object {
        /** Attribute name under which [path] is stored in the layout XML. */
        const val PATH_ATTRIBUTE: String = "claudeCodePath"

        /**
         * Read a pane's address out of its layout element.
         *
         * Kept here, apart from [ClaudeCodeEditorProvider], so the persistence
         * contract is testable on its own: the provider's signature demands a
         * Project and a VirtualFile it never actually uses, which a plain unit test
         * cannot supply.
         *
         * A missing or blank attribute yields null — a tab that never navigated has
         * nothing to restore, and inventing a path would send a restored pane
         * somewhere the user never was.
         */
        fun readFrom(element: Element): ClaudeCodeEditorState =
            ClaudeCodeEditorState(element.getAttributeValue(PATH_ATTRIBUTE)?.takeIf { it.isNotBlank() })

        /** Write [state]'s address into its layout element, omitting a null one. */
        fun writeTo(state: FileEditorState, element: Element) {
            val path = (state as? ClaudeCodeEditorState)?.path ?: return
            element.setAttribute(PATH_ATTRIBUTE, path)
        }
    }
}
