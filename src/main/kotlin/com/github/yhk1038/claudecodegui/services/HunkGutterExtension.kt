package com.github.yhk1038.claudecodegui.services

import com.intellij.diff.DiffContext
import com.intellij.diff.DiffExtension
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.requests.DiffRequest
import com.intellij.diff.tools.simple.SimpleDiffViewer
import com.intellij.diff.tools.util.base.DiffViewerListener
import com.intellij.diff.util.DiffGutterRenderer
import com.intellij.diff.util.Side
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter

/**
 * Draws a tick box beside every changed hunk in a review diff, so the reviewer
 * keeps or drops each change where they are already reading it (#109).
 *
 * A [DiffExtension] rather than a custom viewer: the diff itself stays the
 * IDE's own, and we only add marks to the gutter it already draws. Runs for
 * every diff the IDE opens, so it does nothing unless the request carries a
 * [HunkSelection] — which only our permission-review diffs do.
 */
class HunkGutterExtension : DiffExtension() {
    private val logger = Logger.getInstance(HunkGutterExtension::class.java)

    override fun onViewerCreated(
        viewer: FrameDiffTool.DiffViewer,
        context: DiffContext,
        request: DiffRequest,
    ) {
        val selection = request.getUserData(HunkSelection.KEY) ?: return
        if (selection.total == 0) return

        // Only the side-by-side viewer is handled: it is what our review diffs
        // open with, and a viewer we do not recognise must be left alone rather
        // than half-decorated.
        val simple = viewer as? SimpleDiffViewer ?: return

        // The viewer exists before it has compared anything — asking for its
        // changes here returns an empty list (measured). Wait for the diff pass
        // to finish, and redo the marks on every later pass, since re-diffing
        // discards the highlighters we added.
        simple.addListener(object : DiffViewerListener() {
            override fun onAfterRediff() {
                try {
                    attach(simple, selection)
                } catch (e: Exception) {
                    // A missing tick box is a degraded review, not a broken IDE
                    // — the Apply button below still acts on the whole change.
                    logger.warn("Failed to attach hunk checkboxes to the diff gutter", e)
                }
            }
        })
    }

    private fun attach(viewer: SimpleDiffViewer, selection: HunkSelection) {
        val changes = viewer.diffChanges
        if (changes.isEmpty()) return

        // The backend splits the change into hunks and the IDE computes its own
        // fragments; when the two disagree we cannot map a tick box to a hunk,
        // so leave the gutter alone rather than tick the wrong line.
        if (changes.size != selection.total) {
            logger.info(
                "Hunk count differs (ide=${changes.size}, backend=${selection.total}); skipping gutter checkboxes",
            )
            return
        }

        val editor = viewer.getEditor(Side.RIGHT)
        // A re-diff re-runs this, so drop the previous round's marks first —
        // otherwise every pass leaves another stale box in the gutter.
        selection.disposeMarks()

        changes.forEachIndexed { index, change ->
            val line = change.getStartLine(Side.RIGHT)
            if (line < 0 || line >= editor.document.lineCount) return@forEachIndexed

            val offset = editor.document.getLineStartOffset(line)
            val highlighter = editor.markupModel.addRangeHighlighter(
                offset,
                offset,
                HighlighterLayer.LAST,
                null,
                HighlighterTargetArea.EXACT_RANGE,
            )
            highlighter.gutterIconRenderer = HunkCheckboxRenderer(selection, index) {
                editor.gutterComponentEx.repaint()
            }
            selection.rememberMark(highlighter) { editor.markupModel.removeHighlighter(it as RangeHighlighter) }
        }
    }
}

/**
 * The tick box itself. Uses the IDE's own diff-gutter checkbox icons so it
 * reads as part of the gutter rather than as a plugin's decoration.
 */
private class HunkCheckboxRenderer(
    private val selection: HunkSelection,
    private val index: Int,
    private val onToggled: () -> Unit,
) : DiffGutterRenderer(
    if (selection.isAccepted(index)) AllIcons.Diff.GutterCheckBoxSelected else AllIcons.Diff.GutterCheckBox,
    "Keep this change",
) {
    override fun getIcon() =
        if (selection.isAccepted(index)) AllIcons.Diff.GutterCheckBoxSelected else AllIcons.Diff.GutterCheckBox

    override fun getTooltipText(): String =
        if (selection.isAccepted(index)) "This change will be applied — click to drop it"
        else "This change will be left out — click to keep it"

    override fun performAction(e: AnActionEvent) {
        toggle()
    }

    /**
     * The gutter routes a plain click here rather than through an action, so
     * both paths have to land on the same toggle — otherwise clicking the box
     * would look dead while the action-system route worked.
     */
    override fun handleMouseClick() {
        toggle()
    }

    private fun toggle() {
        selection.toggle(index)
        onToggled()
    }
}
