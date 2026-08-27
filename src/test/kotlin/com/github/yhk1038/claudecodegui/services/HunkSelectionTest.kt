package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Decisions surviving a re-diff (#359).
 *
 * The IDE re-diffs whenever the proposed side is edited, and every pass hands
 * the split back through [HunkSelection.setRanges]. That call used to mark
 * everything kept, so a reviewer who unticked one hunk and then typed anywhere
 * else in the file found the unticked hunk selected again — measured in QA on a
 * three-constant file: decline the first hunk, edit an unrelated line, and the
 * decline was gone.
 *
 * Decisions are held as the regions themselves rather than as positions among
 * them, because a re-diff renumbers: editing the proposed side turned two hunks
 * into three, and index 0 no longer named the region that had been declined.
 */
class HunkSelectionTest {

    private fun range(start: Int) = AcceptedRange(
        oldStart = start,
        oldEnd = start + 1,
        newStart = start,
        newEnd = start + 1,
    )

    private val first = range(0)
    private val second = range(2)
    private val third = range(4)

    @Test
    fun `everything is kept before the reviewer decides anything`() {
        val selection = HunkSelection()

        selection.setRanges(listOf(first, second))

        assertEquals(listOf(0, 1), selection.acceptedIndices())
    }

    @Test
    fun `a declined hunk survives a re-diff that keeps the same regions`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))

        selection.toggle(0)
        // What the IDE does after any edit to the proposed side.
        selection.setRanges(listOf(first, second))

        assertFalse(selection.isAccepted(0)) {
            "The decline was forgotten on re-diff, so an unticked hunk comes back selected (#359)."
        }
        assertTrue(selection.isAccepted(1))
    }

    /**
     * The reported case: the edit adds a hunk, so the regions are renumbered.
     * The decline has to follow the region it was made about, not the position
     * that region used to occupy.
     */
    @Test
    fun `a declined hunk survives a re-diff that renumbers the hunks`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))
        selection.toggle(0)

        // Editing an earlier line introduces a hunk ahead of the declined one.
        val introduced = range(-2)
        selection.setRanges(listOf(introduced, first, second))

        assertTrue(selection.isAccepted(0)) { "The newly introduced hunk should start kept." }
        assertFalse(selection.isAccepted(1)) {
            "The decline did not follow its region through the renumbering (#359)."
        }
        assertTrue(selection.isAccepted(2))
    }

    /**
     * A reviewer who changes their mind must be able to. Without this the
     * region would stay declined forever, since the record is keyed by region.
     */
    @Test
    fun `re-ticking a hunk clears the decline`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))

        selection.toggle(0)
        selection.toggle(0)
        selection.setRanges(listOf(first, second))

        assertTrue(selection.isAccepted(0))
    }

    @Test
    fun `clear all leaves every hunk declined across a re-diff`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))

        selection.setAll(false)
        selection.setRanges(listOf(first, second))

        assertEquals(emptyList<Int>(), selection.acceptedIndices())
    }

    @Test
    fun `select all clears every decline across a re-diff`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))
        selection.toggle(0)

        selection.setAll(true)
        selection.setRanges(listOf(first, second))

        assertEquals(listOf(0, 1), selection.acceptedIndices())
    }

    /**
     * A region the reviewer declined and then edited away is simply gone. The
     * record may keep naming it; what matters is that it does not affect the
     * hunks that are actually on screen.
     */
    @Test
    fun `a decline for a region that no longer exists affects nothing`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))
        selection.toggle(0)

        selection.setRanges(listOf(second, third))

        assertEquals(listOf(0, 1), selection.acceptedIndices())
    }

    @Test
    fun `the ranges reported back are the ones still kept`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(first, second))

        selection.toggle(0)

        assertEquals(listOf(second), selection.acceptedRanges())
    }
}
