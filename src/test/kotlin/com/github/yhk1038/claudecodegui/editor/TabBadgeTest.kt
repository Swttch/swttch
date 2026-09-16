package com.github.yhk1038.claudecodegui.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the badge a chat tab wears (issue #449).
 *
 * The icon itself is not asserted here: resolving one needs the icon subsystem,
 * and whether the spinner actually turns on a tab label is a question about the
 * platform rather than about this class. That was measured in a sandbox IDE
 * instead, by recording the tab strip at 20fps while a session streamed.
 *
 * What is asserted here is the part this file decides: which badge a tab holds,
 * and whether a caller is told to refresh the icon.
 */
class TabBadgeTest {

    @Test
    fun `a tab starts with no badge`() {
        val file = ClaudeCodeVirtualFile("tab-1")

        assertEquals(TabBadge.NONE, file.badgeState)
    }

    @Test
    fun `setting a new badge reports that the icon has to be refreshed`() {
        val file = ClaudeCodeVirtualFile("tab-1")

        assertTrue(file.setBadge(TabBadge.WORKING))
        assertEquals(TabBadge.WORKING, file.badgeState)
    }

    @Test
    fun `setting the badge it already holds reports nothing to do`() {
        val file = ClaudeCodeVirtualFile("tab-1")
        file.setBadge(TabBadge.WORKING)

        // The caller refreshes editor icons on a true return, so answering true
        // here would repaint every tab on each streaming report the WebView
        // sends, which is many per response.
        assertFalse(file.setBadge(TabBadge.WORKING))
        assertEquals(TabBadge.WORKING, file.badgeState)
    }

    @Test
    fun `a stream that ends on a tab nobody is looking at leaves it unread`() {
        val file = ClaudeCodeVirtualFile("tab-1")
        file.setBadge(TabBadge.WORKING)

        assertTrue(file.setBadge(TabBadge.UNREAD))
        assertEquals(TabBadge.UNREAD, file.badgeState)
    }

    @Test
    fun `a stream that ends on the open tab leaves no badge`() {
        val file = ClaudeCodeVirtualFile("tab-1")
        file.setBadge(TabBadge.WORKING)

        assertTrue(file.setBadge(TabBadge.NONE))
        assertEquals(TabBadge.NONE, file.badgeState)
    }

    @Test
    fun `badges belong to one tab each`() {
        val working = ClaudeCodeVirtualFile("tab-1")
        val untouched = ClaudeCodeVirtualFile("tab-2")

        working.setBadge(TabBadge.WORKING)

        assertEquals(TabBadge.WORKING, working.badgeState)
        assertEquals(TabBadge.NONE, untouched.badgeState)
    }

    @Test
    fun `a session waiting on an answer wears the badge whether or not the tab is selected`() {
        val file = ClaudeCodeVirtualFile("tab-1")
        file.setBadge(TabBadge.WORKING)

        assertTrue(file.setBadge(TabBadge.AWAITING))
        assertEquals(TabBadge.AWAITING, file.badgeState)
    }

    /**
     * The rule the selection listener acts on (issue #456).
     *
     * An unread badge is taken off by arriving at the tab, because arriving IS
     * reading it. The other two are not: a running session does not stop because
     * someone looked at it, and a question does not become answered by being
     * looked at. Before this, a waiting tab would have dropped its badge the
     * moment the user clicked it — while the question it pointed at was still on
     * screen, unanswered.
     */
    @Test
    fun `only the unread badge is cleared by selecting the tab`() {
        assertTrue(TabBadge.UNREAD.clearedBySelection)
        assertFalse(TabBadge.WORKING.clearedBySelection)
        assertFalse(TabBadge.AWAITING.clearedBySelection)
        assertFalse(TabBadge.NONE.clearedBySelection)
    }

    @Test
    fun `the reports the WebView sends map onto the three activities`() {
        assertEquals(TabActivity.STREAMING, TabActivity.fromReport("streaming"))
        assertEquals(TabActivity.AWAITING, TabActivity.fromReport("awaiting"))
        assertEquals(TabActivity.IDLE, TabActivity.fromReport("idle"))
    }

    /**
     * A word this build does not know claims nothing, so it reads as idle rather
     * than throwing. The one that exists today is `repaint`, which the panel
     * intercepts before it ever reaches here; the case that matters is a future
     * WebView reporting something this plugin predates.
     */
    @Test
    fun `an unrecognized report reads as idle`() {
        assertEquals(TabActivity.IDLE, TabActivity.fromReport("something-new"))
        assertEquals(TabActivity.IDLE, TabActivity.fromReport(""))
    }
}
