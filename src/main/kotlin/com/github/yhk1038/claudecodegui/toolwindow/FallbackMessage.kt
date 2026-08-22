package com.github.yhk1038.claudecodegui.toolwindow

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
 * The width to lay the message out at inside a panel [panelWidth] wide whose
 * border eats [horizontalInsets] pixels.
 *
 * [panelWidth] is 0 until the panel has been laid out, which is exactly when the
 * label's initial text is built; the maximum is the best guess there, and the
 * first `componentResized` corrects it.
 */
internal fun fallbackMessageWidth(panelWidth: Int, horizontalInsets: Int): Int {
    if (panelWidth <= 0) return FALLBACK_MESSAGE_MAX_WIDTH
    return (panelWidth - horizontalInsets)
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
 */
internal fun JPanel.installReflowingMessage(label: JLabel, bodyHtml: String) {
    fun reflow() {
        val insets = this.insets
        label.text = fallbackMessageHtml(
            bodyHtml,
            fallbackMessageWidth(width, insets.left + insets.right)
        )
    }

    reflow()
    addComponentListener(object : ComponentAdapter() {
        override fun componentResized(e: ComponentEvent) = reflow()
    })
}
