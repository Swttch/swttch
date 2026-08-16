package com.github.yhk1038.claudecodegui.services

import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.FlowLayout
import javax.swing.Box
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

/** One reviewable change within a proposed edit, as the backend split it. */
data class DiffHunk(
    val index: Int,
    val oldStart: Int,
    val oldLines: Int,
    val newStart: Int,
    val newLines: Int,
)

/**
 * The bar under a proposed-edit diff: how much is currently kept, a way to take
 * or drop everything at once, and the Apply / Reject that answers the CLI's
 * permission request (#109).
 *
 * The per-change tick boxes are NOT here — they sit in the diff gutter beside
 * the lines they belong to (see [HunkGutterExtension]), so a reviewer decides
 * where they are already reading. This bar only carries what has no natural
 * home next to a single change.
 */
class DiffReviewPanel(
    private val selection: HunkSelection,
    private val onResolve: (acceptedHunks: List<Int>) -> Unit,
) {
    private val summary = JBLabel()
    private val applyButton = JButton()
    private val selectAllButton = JButton()

    val component: JComponent = build()

    private fun build(): JComponent {
        val root = JPanel(FlowLayout(FlowLayout.RIGHT, 8, 4))
        root.border = JBUI.Borders.empty(2, 8)

        // Nothing to select between when the change is a single hunk (or could
        // not be split), so the bar is just accept/reject.
        if (selection.total > 1) {
            root.add(summary)
            selectAllButton.addActionListener {
                selection.setAll(selection.keptCount() != selection.total)
            }
            root.add(selectAllButton)
            root.add(Box.createHorizontalStrut(8))
        }

        applyButton.addActionListener { onResolve(selection.acceptedIndices()) }
        val rejectButton = JButton("Reject")
        rejectButton.addActionListener { onResolve(emptyList()) }
        root.add(applyButton)
        root.add(rejectButton)

        // The gutter owns the tick boxes, so the bar has to follow their state
        // rather than hold its own copy.
        selection.onChange { refresh() }
        refresh()
        return root
    }

    /**
     * Keep the bar honest about what pressing Apply will do — plain "Apply" when
     * everything is kept, and the count as soon as it is not.
     */
    private fun refresh() {
        val total = selection.total
        if (total <= 1) {
            applyButton.text = "Apply"
            return
        }
        val kept = selection.keptCount()
        summary.text = "$kept of $total selected"
        selectAllButton.text = if (kept == total) "Clear all" else "Select all"
        applyButton.text = if (kept == total) "Apply" else "Apply $kept of $total"
        // Keeping nothing is a rejection, and Reject already says that.
        applyButton.isEnabled = kept > 0
    }
}
