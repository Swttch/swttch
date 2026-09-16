package com.github.yhk1038.claudecodegui.editor

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins which reports a chat tab has to redraw its icon for (issue #456).
 */
class TabActivityTrackerTest {

    @Test
    fun `a fresh tab reporting idle has nothing to draw`() {
        val tracker = TabActivityTracker()

        // The WebView reports idle whenever the page mounts, so this is what a
        // tab that was merely moved, split or reloaded says. Drawing on it would
        // take down an unread badge the user has not seen yet.
        assertFalse(tracker.record(TabActivity.IDLE))
    }

    @Test
    fun `a tab that starts working has to be drawn`() {
        val tracker = TabActivityTracker()

        assertTrue(tracker.record(TabActivity.STREAMING))
    }

    @Test
    fun `a tab that starts waiting on an answer has to be drawn`() {
        val tracker = TabActivityTracker()

        assertTrue(tracker.record(TabActivity.AWAITING))
    }

    /**
     * The one the bug was in.
     *
     * Both hosts used to record the report only after drawing the icon, and the
     * drawing threw: it ran on the AppKit thread while the platform lets only the
     * EDT touch a tab icon. The exception unwound the callback past the recording,
     * so the tab still believed it was idle while wearing a spinner — and the
     * `idle` report that ends the turn then read idle against idle, took itself
     * for a freshly mounted page, and drew nothing. The spinner stayed on a
     * session that had stopped, which is what the user saw while a background task
     * ran on after the answer was finished.
     *
     * Recording is now a step of its own, and it happens first.
     */
    @Test
    fun `a turn that ends has to be drawn, whatever happened to the drawing before it`() {
        val tracker = TabActivityTracker()

        tracker.record(TabActivity.STREAMING)

        assertTrue(tracker.record(TabActivity.IDLE))
    }

    @Test
    fun `a wait that ends has to be drawn`() {
        val tracker = TabActivityTracker()

        tracker.record(TabActivity.AWAITING)

        assertTrue(tracker.record(TabActivity.IDLE))
    }

    @Test
    fun `an idle tab reporting idle again has nothing to draw`() {
        val tracker = TabActivityTracker()

        tracker.record(TabActivity.STREAMING)
        tracker.record(TabActivity.IDLE)

        assertFalse(tracker.record(TabActivity.IDLE))
    }

    @Test
    fun `a session that keeps working is redrawn on every report`() {
        val tracker = TabActivityTracker()

        // Not folded away: the tool-window host assigns the same spinner again,
        // which costs nothing, and the editor host's own setBadge is what folds a
        // repeat. Answering false here would instead mean a tab that somehow lost
        // its icon could never get it back while the turn ran.
        assertTrue(tracker.record(TabActivity.STREAMING))
        assertTrue(tracker.record(TabActivity.STREAMING))
    }

    @Test
    fun `answering a prompt puts the tab back to work`() {
        val tracker = TabActivityTracker()

        tracker.record(TabActivity.STREAMING)
        tracker.record(TabActivity.AWAITING)

        assertTrue(tracker.record(TabActivity.STREAMING))
    }
}
