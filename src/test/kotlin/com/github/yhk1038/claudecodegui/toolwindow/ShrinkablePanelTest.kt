package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JPanel

/**
 * Issue #750: a chat tab behind another editor tab held its last size as its
 * minimum, so the IDE could not narrow that editor window.
 */
class ShrinkablePanelTest {

    /**
     * Puts the shape a chat tab has once its page is up (the panel, a stage with
     * no layout manager inside it, the page inside the stage) on a stand-in tab
     * strip at [SHOWN], then takes it off again, which is what the IDE does when
     * another tab is selected.
     */
    private fun showThenHide(panel: JPanel) {
        val stage = JPanel(null)
        stage.add(JPanel())
        panel.add(stage, BorderLayout.CENTER)

        val tabStrip = JPanel(null)
        tabStrip.addNotify()
        tabStrip.add(panel)
        panel.setBounds(0, 0, SHOWN.width, SHOWN.height)
        panel.validate()
        assertEquals(SHOWN, stage.size, "the stage must have been laid out at the tab's size")

        tabStrip.remove(panel)
        assertFalse(panel.isDisplayable, "the hidden tab must be off screen")
    }

    /** Without this the test below could pass on a runtime where the trap does not exist. */
    @Test
    fun `a plain panel reports its last size as its minimum once hidden`() {
        val panel = JPanel(BorderLayout())

        showThenHide(panel)

        assertEquals(SHOWN, panel.minimumSize)
    }

    @Test
    fun `a hidden tab does not hold its last size as its minimum`() {
        val panel = ShrinkablePanel(BorderLayout())

        showThenHide(panel)

        assertEquals(Dimension(0, 0), panel.minimumSize)
    }

    @Test
    fun `the chat panel is shrinkable`() {
        assertTrue(ShrinkablePanel::class.java.isAssignableFrom(ClaudeCodePanel::class.java))
        assertFalse(
            ClaudeCodePanel::class.java.declaredMethods.any { it.name == "getMinimumSize" },
            "the chat panel must not replace the minimum size it inherits",
        )
    }

    private companion object {
        val SHOWN = Dimension(1291, 926)
    }
}
