package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SessionViewJudgeTest {

    private fun placement(
        editor: Boolean = false,
        visible: Boolean = false,
        selected: Boolean = false,
    ) = SessionPlacement(editorTabSelected = editor, toolWindowVisible = visible, toolWindowTabSelected = selected)

    @Test
    fun `a selected editor tab in a focused IDE is being viewed`() {
        assertTrue(SessionViewJudge.isViewing(placement(editor = true), ideFocused = true))
    }

    @Test
    fun `the selected tool window tab of a visible tool window in a focused IDE is being viewed`() {
        assertTrue(SessionViewJudge.isViewing(placement(visible = true, selected = true), ideFocused = true))
    }

    @Test
    fun `a tool window tab that is not the selected one is not being viewed`() {
        assertFalse(SessionViewJudge.isViewing(placement(visible = true, selected = false), ideFocused = true))
    }

    @Test
    fun `the selected tab of a hidden tool window is not being viewed`() {
        assertFalse(SessionViewJudge.isViewing(placement(visible = false, selected = true), ideFocused = true))
    }

    @Test
    fun `nothing is viewed while the IDE window is not focused`() {
        assertFalse(SessionViewJudge.isViewing(placement(editor = true), ideFocused = false))
        assertFalse(SessionViewJudge.isViewing(placement(visible = true, selected = true), ideFocused = false))
    }

    @Test
    fun `a banner is dismissed when the user arrives at its session`() {
        assertTrue(SessionViewJudge.shouldDismissBanner(true, placement(editor = true), ideFocused = true))
        assertTrue(SessionViewJudge.shouldDismissBanner(true, placement(visible = true, selected = true), ideFocused = true))
    }

    @Test
    fun `a banner stays while the user is not at its session or the IDE is in the background`() {
        assertFalse(SessionViewJudge.shouldDismissBanner(true, placement(visible = true, selected = false), ideFocused = true))
        assertFalse(SessionViewJudge.shouldDismissBanner(true, placement(editor = true), ideFocused = false))
    }

    @Test
    fun `there is nothing to dismiss without a banner`() {
        assertFalse(SessionViewJudge.shouldDismissBanner(false, placement(editor = true), ideFocused = true))
    }
}
