package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards the fix for issue #359: a redraw must replace the tab on screen rather
 * than bring it forward.
 *
 * `openDiffViewer` starts with a guard that surfaces an already-open tab instead
 * of rebuilding it, so clicking the file name in the approval prompt does not
 * discard the hunks a reviewer has ticked. A redraw has to skip that guard,
 * because in a redraw the open tab is precisely what is stale.
 *
 * That distinction used to be inferred from whether a banner was being passed,
 * which silently killed the banner's Refresh: it redraws with the banner
 * cleared, so the guard read it as an ordinary open, surfaced the old tab and
 * returned. On screen the button looked dead — no error, no log — while the
 * backend had already rebuilt the change and reported success.
 */
class ReviewRedrawGuardTest {

    @Test
    fun `an ordinary open surfaces the tab already on screen`() {
        assertTrue(
            DiffService.shouldSurfaceExistingTab(replaceExisting = false, hasExistingTab = true),
        ) {
            "Clicking the file name while its diff is open should bring that tab forward, not " +
                "rebuild it — rebuilding discards the hunks the reviewer has ticked."
        }
    }

    @Test
    fun `a redraw replaces the tab instead of surfacing it`() {
        assertFalse(
            DiffService.shouldSurfaceExistingTab(replaceExisting = true, hasExistingTab = true),
        ) {
            "A redraw surfaced the existing tab instead of replacing it, so Refresh and Dismiss " +
                "do nothing on screen (#359)."
        }
    }

    /**
     * Refresh redraws with the banner cleared, which is the exact shape that
     * used to be misread as an ordinary open. Pinned separately from the case
     * above because it is the one a reviewer actually hits.
     */
    @Test
    fun `a redraw that clears the banner is still a redraw`() {
        assertFalse(
            DiffService.shouldSurfaceExistingTab(replaceExisting = true, hasExistingTab = true),
        ) {
            "Refresh cleared the banner and was then treated as an ordinary open, so the stale " +
                "tab was surfaced and the rebuilt change never reached the screen (#359)."
        }
    }

    @Test
    fun `with no tab open there is nothing to surface`() {
        assertFalse(
            DiffService.shouldSurfaceExistingTab(replaceExisting = false, hasExistingTab = false),
        )
        assertFalse(
            DiffService.shouldSurfaceExistingTab(replaceExisting = true, hasExistingTab = false),
        )
    }
}
