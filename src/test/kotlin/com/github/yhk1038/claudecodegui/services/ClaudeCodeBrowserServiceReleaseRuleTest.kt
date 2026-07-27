package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Unit tests for the pooled-browser release rule used by
 * [ClaudeCodeBrowserService.releaseRef].
 *
 * Regression guard for issue #29: dragging a Claude chat tab to a different
 * split/position disposes the panel and recreates it in the new slot. The
 * earlier fix keyed the release decision on `FileEditorManager.isFileOpen`
 * checked one EDT tick later, but the tab-move close→open gap raced that tick
 * (37–48ms in practice), so the pooled JCEF browser was released
 * non-deterministically — sometimes reattached (no flicker), sometimes
 * recreated (visible blank + reload).
 *
 * The deterministic rule: release the pooled browser only when NO panel still
 * references it (refCount == 0). A tab move briefly drops the count to 0 and
 * then re-acquires it; a grace delay + re-acquire cancellation (verified via
 * run-ide) keeps the browser alive across that gap. These tests pin the pure
 * count rule.
 */
class ClaudeCodeBrowserServiceReleaseRuleTest {

    @Test
    fun `retains pooled browser while at least one panel still references it`() {
        assertFalse(
            shouldReleasePooledBrowser(remainingPanelRefs = 1),
            "Must NOT release while a panel still references the pooled browser",
        )
    }

    @Test
    fun `releases pooled browser only when no panel references it`() {
        assertTrue(
            shouldReleasePooledBrowser(remainingPanelRefs = 0),
            "Must release once no panel references the pooled browser",
        )
    }

    @Test
    fun `treats a negative ref count as released (defensive against double-release)`() {
        assertTrue(
            shouldReleasePooledBrowser(remainingPanelRefs = -1),
            "A negative count must still be treated as fully released",
        )
    }

    // ── indexOfReusableHolder: tab move reuses, split creates (issue #48) ──

    @Test
    fun `no holders yet means none to reuse (first open creates one)`() {
        assertNull(indexOfReusableHolder(emptyList()))
    }

    @Test
    fun `the sole occupied holder cannot be reused (split spawns a second browser)`() {
        // One live pane holds the only browser → a split must NOT steal it.
        assertNull(indexOfReusableHolder(listOf(1)))
    }

    @Test
    fun `a freed holder is reused (tab move preserves the page)`() {
        // The old pane released its holder (refCount 0) → the new slot reuses it.
        assertEquals(0, indexOfReusableHolder(listOf(0)))
    }

    @Test
    fun `picks the first unoccupied holder when some are occupied`() {
        assertEquals(1, indexOfReusableHolder(listOf(2, 0, 0)))
    }

    @Test
    fun `all holders occupied means none to reuse (every split pane is live)`() {
        assertNull(indexOfReusableHolder(listOf(1, 1)))
    }

    // ── isTeardown: skip the deferred release during teardown (issue #231) ──
    //
    // Closing a project disposes ClaudeCodeBrowserService — and the release alarm
    // parented to it — before the panels it owns. Each panel's farewell releaseRef
    // then scheduled onto a dead alarm, and the platform logged "Already disposed"
    // as an IDE internal error, once per open tab.
    //
    // Verified with run-ide on IntelliJ IDEA 2024.2 (one open tab, File > Close
    // Project): the service's dispose released the holder at 16:29:48.060 and the
    // panel's releaseRef arrived at 16:29:48.078 — so releasing inline instead of
    // skipping would dispose the same holder twice. The platform had already
    // written claudeCodeEditorTabs.xml at 16:29:47.841, before either.

    @Test
    fun `a live project with a live service schedules the deferred release as usual`() {
        assertFalse(
            isTeardown(projectDisposed = false, serviceDisposed = false),
            "Normal tab close must still take the grace-period path",
        )
    }

    @Test
    fun `a disposed service means teardown (its release alarm is already dead)`() {
        assertTrue(
            isTeardown(projectDisposed = false, serviceDisposed = true),
            "Scheduling onto the disposed service's alarm is what logs 'Already disposed'",
        )
    }

    @Test
    fun `a disposed project means teardown even before the service is disposed`() {
        assertTrue(
            isTeardown(projectDisposed = true, serviceDisposed = false),
            "Project teardown must skip the release regardless of service state",
        )
    }

    @Test
    fun `both disposed is teardown`() {
        assertTrue(isTeardown(projectDisposed = true, serviceDisposed = true))
    }
}
