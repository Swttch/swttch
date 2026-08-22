package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.Dimension
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * Shared text layout for the panels shown in place of the chat when JCEF cannot
 * host it — [JcefUnavailablePanel] and [JcefRuntimeMismatchPanel].
 *
 * Swing lays an HTML [JLabel] out at whatever width the markup asks for and lets
 * the container clip the overflow. It never re-flows. Both panels asked for a
 * fixed `width: 480px`, so docking the chat to the side — where the tool window
 * is routinely narrower than that — cut every sentence off mid-word. These are
 * the two screens whose only job is to explain why the chat is missing, so text
 * the user cannot read defeats the point (issue #321).
 *
 * The width therefore has to follow the panel. An upper bound stays because the
 * opposite extreme is just as unreadable: on a wide editor tab the same text
 * would stretch into 1500px lines.
 */
internal const val FALLBACK_MESSAGE_MAX_WIDTH = 480

/**
 * Below this, wrapping breaks so many words that the text is unreadable anyway.
 * Clipping the edge of an over-narrow panel is the lesser of the two.
 */
internal const val FALLBACK_MESSAGE_MIN_WIDTH = 180

/**
 * Slack between the width we ask the markup for and the width the panel actually
 * has.
 *
 * A `width: Npx` in Swing's HTML sizes the text block, not the rendered label:
 * list indentation and element margins push the real preferred width past N. A
 * first attempt handed the markup every available pixel and the text still
 * clipped — measured at panelWidth=564, insets=80, so 480px of markup inside
 * 484px of space, and the `<ol>` overhang ate the remaining 4px.
 */
internal const val FALLBACK_MESSAGE_GUTTER = 24

/**
 * The width to lay the message out at inside a panel [panelWidth] wide whose
 * border eats [horizontalInsets] pixels.
 *
 * [panelWidth] is 0 until the panel has been laid out, which is exactly when the
 * label's initial text is built; the maximum is the best guess there, and the
 * first `componentResized` corrects it.
 */
internal fun fallbackMessageWidth(panelWidth: Int, horizontalInsets: Int): Int {
    if (panelWidth <= 0) return FALLBACK_MESSAGE_MAX_WIDTH
    return (panelWidth - horizontalInsets - FALLBACK_MESSAGE_GUTTER)
        .coerceIn(FALLBACK_MESSAGE_MIN_WIDTH, FALLBACK_MESSAGE_MAX_WIDTH)
}

/** Wraps [bodyHtml] in the centred, width-constrained document both panels use. */
internal fun fallbackMessageHtml(bodyHtml: String, widthPx: Int): String =
    "<html><div style='text-align:center; width: ${widthPx}px;'>$bodyHtml</div></html>"

/**
 * Points [label] at [bodyHtml] and keeps its width in step with this panel's.
 *
 * Re-flowing on resize rather than picking one width up front is what makes the
 * text survive both a narrow docked tool window and a wide editor tab — the user
 * can drag between the two at any time.
 *
 * Pinning the label's width is the second half of the fix, and it takes all
 * three size hints. A `JLabel` derives every one of them from its rendered HTML,
 * so when that overshoots the column — which it does, hence the gutter — the
 * layout honours the oversized *minimum* and lets the surplus hang off the right
 * edge. Capping only the maximum leaves the minimum in charge and changes
 * nothing; that was measured, with the heading itself clipped mid-word on a
 * narrow tool window.
 *
 * The height still has to come from the text, so the hints are cleared before
 * asking for the preferred size — otherwise the previous answer is echoed back
 * and the panel keeps the height of whatever width it had last.
 */
internal fun JPanel.installReflowingMessage(label: JLabel, bodyHtml: String) {
    fun reflow() {
        val insets = this.insets
        label.text = fallbackMessageHtml(
            bodyHtml,
            fallbackMessageWidth(width, insets.left + insets.right)
        )

        val available = width - insets.left - insets.right
        if (available <= 0) return

        label.minimumSize = null
        label.preferredSize = null
        label.maximumSize = null

        val pinned = Dimension(available, label.preferredSize.height)
        label.minimumSize = pinned
        label.preferredSize = pinned
        label.maximumSize = pinned
    }

    reflow()
    addComponentListener(object : ComponentAdapter() {
        override fun componentResized(e: ComponentEvent) = reflow()
    })
}
