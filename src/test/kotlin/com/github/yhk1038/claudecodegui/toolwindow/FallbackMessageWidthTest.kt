package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * Guards the re-flow rule behind [fallbackMessageWidth] — the fix for the
 * fallback panels being clipped mid-sentence.
 *
 * Swing lays an HTML [javax.swing.JLabel] out at whatever width the markup asks
 * for and lets the container clip the overflow; it never re-flows. Both fallback
 * panels hard-coded `width: 480px`, so docking the chat to the side — where the
 * tool window is routinely narrower than that — cut every line off mid-word.
 * That is the worst place for it, since these panels exist to explain why the
 * chat is missing at all (issue #321).
 */
class FallbackMessageWidthTest {

    @Nested
    inner class Width {

        @Test
        fun `uses the panel width when it is narrower than the readable maximum`() {
            // 320px panel, 80px of border, 24px of gutter → 216px of text column.
            assertEquals(216, fallbackMessageWidth(panelWidth = 320, horizontalInsets = 80))
        }

        @Test
        fun `leaves the gutter free even when the panel could hold the maximum`() {
            // The measured regression: 564px panel with 80px of border leaves 484px,
            // and asking for the full 480px maximum still clipped, because the
            // rendered width overshoots what the markup asks for.
            val result = fallbackMessageWidth(panelWidth = 564, horizontalInsets = 80)
            assertEquals(460, result)
            assertTrue(result <= 564 - 80 - FALLBACK_MESSAGE_GUTTER)
        }

        @Test
        fun `caps at the readable maximum on a wide panel`() {
            // An editor tab can be 1500px wide; a single line that long is unreadable.
            assertEquals(
                FALLBACK_MESSAGE_MAX_WIDTH,
                fallbackMessageWidth(panelWidth = 1500, horizontalInsets = 80)
            )
        }

        @Test
        fun `stops shrinking at the minimum rather than breaking every word`() {
            assertEquals(
                FALLBACK_MESSAGE_MIN_WIDTH,
                fallbackMessageWidth(panelWidth = 120, horizontalInsets = 80)
            )
        }

        @Test
        fun `falls back to the maximum before the panel has been laid out`() {
            // componentResized has not fired yet, so width is still 0. Guessing the
            // maximum keeps the first paint readable; the resize corrects it.
            assertEquals(
                FALLBACK_MESSAGE_MAX_WIDTH,
                fallbackMessageWidth(panelWidth = 0, horizontalInsets = 80)
            )
        }

        @Test
        fun `always leaves the gutter free when the panel can hold the minimum`() {
            // The property that actually matters. Panels narrower than the minimum
            // are the deliberate exception — see the test above — so they are excluded
            // rather than silently passing.
            for (panelWidth in listOf(300, 400, 559, 560, 561, 900, 1500)) {
                val usable = panelWidth - 80 - FALLBACK_MESSAGE_GUTTER
                assertTrue(usable >= FALLBACK_MESSAGE_MIN_WIDTH) { "bad fixture: $panelWidth" }

                val result = fallbackMessageWidth(panelWidth, horizontalInsets = 80)
                assertTrue(result <= usable) {
                    "width $result leaves no gutter in the $usable px available in a ${panelWidth}px panel"
                }
            }
        }
    }

    @Nested
    inner class Html {

        @Test
        fun `carries the requested width into the markup`() {
            val html = fallbackMessageHtml("<p>hello</p>", widthPx = 240)
            assertTrue(html.contains("width: 240px")) { html }
            assertTrue(html.contains("<p>hello</p>")) { html }
        }

        @Test
        fun `does not hard-code the old fixed width`() {
            // The regression this whole file exists for: a literal 480px in the
            // markup regardless of how much room the panel actually has.
            val html = fallbackMessageHtml("<p>hello</p>", widthPx = 240)
            assertFalse(html.contains("width: 480px")) { html }
        }
    }
}
