package com.github.yhk1038.claudecodegui.services

import com.intellij.icons.AllIcons
import com.intellij.openapi.ui.Splitter
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.Color
import java.awt.Container
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.event.HierarchyEvent
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * A changed region the reviewer chose to keep, in 0-based lines.
 *
 * Reported as a range rather than a hunk number because the IDE splits a change
 * its own way: on a real file it counted four changes where the backend counted
 * two, and a number only means something if both sides agree on the split.
 */
data class AcceptedRange(
    val oldStart: Int,
    val oldEnd: Int,
    val newStart: Int,
    val newEnd: Int,
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
/** Space above the row, as the diff already had it. */
private const val TOP_PADDING = 2

/** Added below the row: the buttons sat flush against the bottom edge. */
private const val BOTTOM_PADDING = 8

/** Sized once, never shown: a stock button reporting the height a row needs. */
private val MEASURING_BUTTON = JButton("Apply")

/** How wide an icon-only button is, before HiDPI scaling. */
private const val ICON_BUTTON_WIDTH = 42

/** Green for accept, red for refuse — same values in light and dark themes. */
private val ACCEPT_COLOR = Color(0x3A, 0x8A, 0x4F)
private val REJECT_COLOR = Color(0xA8, 0x3E, 0x3E)

class DiffReviewPanel(
    private val selection: HunkSelection,
    /**
     * Answer the request. [keepEdits] separates the two ways of keeping
     * nothing: Apply with every box unticked can still carry the reviewer's own
     * text, while Reject refuses outright and must not smuggle it through
     * (#305).
     */
    private val onResolve: (accepted: List<AcceptedRange>, keepEdits: Boolean) -> Unit,
) {
    private lateinit var root: JPanel
    private val summary = JBLabel()
    /** Wide: the "Clear all" / "Select all" button. Narrow: a bare tick box. */
    private val selectAllButton = JButton()
    private val selectAllBox = JBCheckBox()
    private val applyButton = iconSizedButton()
    private val rejectButton = iconSizedButton()

    val component: JComponent = build()

    private fun build(): JComponent {
        applyButton.addActionListener { onResolve(selection.acceptedRanges(), true) }
        rejectButton.addActionListener { onResolve(emptyList(), false) }
        // Green for accept, red for refuse. Set through the LaF's own colour
        // property so it renders the same on every OS (macOS ignores the Swing
        // "JButton.buttonType" hint entirely).
        paintButton(applyButton, ACCEPT_COLOR)
        paintButton(rejectButton, REJECT_COLOR)

        selectAllButton.addActionListener { selection.setAll(selection.keptCount() != selection.total) }
        selectAllBox.addActionListener { selection.setAll(selectAllBox.isSelected) }

        root = object : JPanel(FlowLayout(FlowLayout.RIGHT, 8, 2)) {
            /**
             * One row of buttons, stated outright.
             *
             * Measured from a spare labelled button rather than from the real
             * ones: this is asked before the row has been laid out — which is
             * what a full-screen window does — and by then our buttons may have
             * dropped their labels for the narrow layout, so their height had
             * collapsed and the bar was clipped. A stock button with text always
             * reports the height a row of buttons needs.
             */
            override fun getPreferredSize(): Dimension {
                val width = super.getPreferredSize().width
                return Dimension(width, rowHeight())
            }

            override fun getMinimumSize(): Dimension = preferredSize
            override fun getMaximumSize(): Dimension = Dimension(Int.MAX_VALUE, preferredSize.height)

            /**
             * Drop the button labels when the diff narrows, so the two
             * decisions survive — a bar that clips Apply off the right edge
             * leaves no way to answer at all. The count and the select-all box
             * stay either way; they are what tells you what Apply will do.
             */
            override fun doLayout() {
                applyLabels(width)
                super.doLayout()
            }
        }
        root.border = JBUI.Borders.empty(TOP_PADDING, 8, BOTTOM_PADDING, 8)

        root.add(summary)
        root.add(selectAllButton)
        root.add(selectAllBox)
        root.add(applyButton)
        root.add(rejectButton)

        // The diff hands BOTTOM_PANEL to a Splitter as its second component
        // (measured in DiffRequestProcessor), and a Splitter divides by ratio
        // and ignores its children's sizes unless told otherwise. Turn that on
        // so the height above is the height used, at any window size.
        root.addHierarchyListener { event ->
            if (event.changeFlags and HierarchyEvent.PARENT_CHANGED.toLong() == 0L) return@addHierarchyListener
            var parent: Container? = root.parent
            while (parent != null && parent !is Splitter) parent = parent.parent
            (parent as? Splitter)?.apply {
                setHonorComponentsPreferredSize(true)
                setResizeEnabled(false)
            }
        }

        // The gutter owns the tick boxes, so the bar has to follow their state
        // rather than hold its own copy.
        selection.onChange { refresh() }
        refresh()
        return root
    }

    /**
     * Word the bar for the room it has, in one place.
     *
     * Both the layout pass and a change of selection land here, so a narrowed
     * bar cannot be widened again by a state update — which is what happened
     * when the two set the labels independently.
     */
    /**
     * Colour a button by its meaning, through the properties IntelliJ's own
     * button UI reads — the same call works under every platform LaF.
     */
    private fun paintButton(button: JButton, color: Color) {
        // Only the client property. Setting `background` too fills the whole
        // component rectangle, and since the LaF redraws just the rounded shape
        // on top, the corners outside it keep the colour as a square halo.
        button.putClientProperty("JButton.backgroundColor", color)
        button.foreground = Color.WHITE
    }

    /**
     * A button that shrinks to its icon once the label is dropped.
     *
     * Clearing the text is not enough: IntelliJ's button UI enforces a minimum
     * width of its own, so an icon-only button still reserved room for the
     * words it no longer draws. Overriding the preferred size outright is the
     * only way past that, and it is stated in scaled pixels so it holds on a
     * HiDPI display too.
     */
    private fun iconSizedButton(): JButton = object : JButton() {
        override fun getPreferredSize(): Dimension {
            val natural = super.getPreferredSize()
            if (text != null) return natural
            return Dimension(JBUI.scale(ICON_BUTTON_WIDTH), natural.height)
        }

        override fun getMinimumSize(): Dimension = preferredSize
        override fun getMaximumSize(): Dimension = preferredSize
    }

    /**
     * The height one row of buttons needs, independent of what our own buttons
     * currently look like.
     */
    private fun rowHeight(): Int =
        MEASURING_BUTTON.preferredSize.height + JBUI.scale(TOP_PADDING + BOTTOM_PADDING)

    private fun applyLabels(width: Int) {
        val total = selection.total
        val kept = selection.keptCount()
        // Below this the labels would push the buttons off the right edge,
        // leaving no way to answer at all — so the words give way to icons.
        val compact = width in 1 until JBUI.scale(340)

        summary.text = if (compact) "$kept of $total" else "$kept of $total selected"
        applyButton.text = if (compact) null else "Apply"
        applyButton.icon = if (compact) AllIcons.Actions.Checked else null
        rejectButton.text = if (compact) null else "Reject"
        rejectButton.icon = if (compact) AllIcons.Actions.Cancel else null
        selectAllButton.text = if (kept == total) "Clear all" else "Select all"

        summary.isVisible = total > 1
        selectAllButton.isVisible = total > 1 && !compact
        selectAllBox.isVisible = total > 1 && compact

        // A button keeps the size it last worked out, and its horizontal margin
        // is sized for text — so dropping the label alone leaves it as wide as
        // the words it no longer draws.
        listOf(applyButton, rejectButton).forEach {
            it.margin = if (compact) JBUI.insets(2) else JBUI.insets(2, 14)
            it.preferredSize = null
            it.invalidate()
        }
    }

    /** Keep the bar honest about what pressing Apply will do. */
    private fun refresh() {
        val total = selection.total
        val kept = selection.keptCount()
        selectAllBox.isSelected = total > 0 && kept == total
        // Keeping nothing is a rejection, and Reject already says that.
        applyButton.isEnabled = total == 0 || kept > 0
        applyLabels(root.width)
        root.revalidate()
        root.repaint()
    }
}
