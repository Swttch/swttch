package com.github.yhk1038.claudecodegui.services

import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.Box
import javax.swing.BoxLayout
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
 * The review controls shown under a proposed-edit diff: a checkbox per change,
 * and the Apply / Reject that answers the CLI's permission request (#109).
 *
 * Lives in the diff window rather than the chat because that is where the
 * change is legible — deciding next to what you are deciding about. Everything
 * starts ticked, so Apply without touching anything means the whole edit, which
 * is what the prompt used to mean.
 */
class DiffReviewPanel(
    hunks: List<DiffHunk>,
    private val onResolve: (acceptedHunks: List<Int>) -> Unit,
) {
    private val checkBoxes = LinkedHashMap<Int, JBCheckBox>()
    private val summary = JBLabel()
    private val applyButton = JButton()

    val component: JComponent = build(hunks)

    private fun build(hunks: List<DiffHunk>): JComponent {
        val root = JPanel(BorderLayout())
        root.border = JBUI.Borders.empty(4, 8)

        // A single-hunk edit has nothing to choose between, so it keeps the
        // plain accept/reject it always had.
        if (hunks.size > 1) {
            val list = JPanel()
            list.layout = BoxLayout(list, BoxLayout.Y_AXIS)
            for (hunk in hunks) {
                val label = "Change ${hunk.index + 1} · line ${hunk.oldStart}" +
                    if (hunk.oldLines > 1) " (${hunk.oldLines} lines)" else ""
                val box = JBCheckBox(label, true)
                box.addActionListener { refreshSummary(hunks.size) }
                checkBoxes[hunk.index] = box
                list.add(box)
            }
            root.add(JBScrollPane(list), BorderLayout.CENTER)
        }

        val actions = JPanel(FlowLayout(FlowLayout.RIGHT, 8, 4))
        if (hunks.size > 1) {
            actions.add(summary)
            actions.add(Box.createHorizontalStrut(8))
        }
        applyButton.addActionListener { onResolve(acceptedHunks()) }
        val rejectButton = JButton("Reject")
        rejectButton.addActionListener { onResolve(emptyList()) }
        actions.add(applyButton)
        actions.add(rejectButton)
        root.add(actions, BorderLayout.SOUTH)

        refreshSummary(hunks.size)
        return root
    }

    private fun acceptedHunks(): List<Int> =
        checkBoxes.filterValues { it.isSelected }.keys.toList()

    /**
     * Keep the button honest about what pressing it will do — "Apply" when
     * everything is kept, and the count as soon as it is not.
     */
    private fun refreshSummary(total: Int) {
        if (total <= 1) {
            applyButton.text = "Apply"
            return
        }
        val kept = acceptedHunks().size
        summary.text = "$kept of $total selected"
        applyButton.text = if (kept == total) "Apply" else "Apply $kept of $total"
        // Keeping nothing is a rejection; Reject already says that.
        applyButton.isEnabled = kept > 0
    }
}
