package com.github.yhk1038.claudecodegui.services

import com.intellij.diff.comparison.ComparisonManagerImpl
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.comparison.DiffTooBigException
import com.intellij.openapi.progress.DumbProgressIndicator
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The regions a review knows before any diff viewer has compared anything
 * (#620), for each shape of proposal the tools send: an edit in the middle, two
 * separate edits, a whole new file, and a file written back unchanged. And the
 * one case where they cannot be known: two texts too large to compare.
 */
class DiffRegionsTest {

    private val manager = ComparisonManagerImpl()

    private fun regions(old: String, new: String) =
        DiffRegions.regionsFrom(old, new) { a, b ->
            manager.compareLines(a, b, ComparisonPolicy.DEFAULT, DumbProgressIndicator.INSTANCE)
        }

    @Test
    fun `one changed line is one region on both sides`() {
        val result = regions("a\nb\nc\n", "a\nB\nc\n")

        assertEquals(listOf(AcceptedRange(oldStart = 1, oldEnd = 2, newStart = 1, newEnd = 2)), result)
    }

    @Test
    fun `two separate edits are two regions in file order`() {
        val result = regions("a\nb\nc\nd\ne\n", "A\nb\nc\nd\nE\n")

        assertEquals(
            listOf(
                AcceptedRange(oldStart = 0, oldEnd = 1, newStart = 0, newEnd = 1),
                AcceptedRange(oldStart = 4, oldEnd = 5, newStart = 4, newEnd = 5),
            ),
            result,
        )
    }

    @Test
    fun `a new file is one region that replaces nothing`() {
        val result = regions("", "x\ny\n")

        assertEquals(listOf(AcceptedRange(oldStart = 0, oldEnd = 0, newStart = 0, newEnd = 2)), result)
    }

    @Test
    fun `lines added in the middle leave the old side empty there`() {
        val result = regions("a\nc\n", "a\nb\nc\n")

        assertEquals(listOf(AcceptedRange(oldStart = 1, oldEnd = 1, newStart = 1, newEnd = 2)), result)
    }

    @Test
    fun `a file written back unchanged has no regions but they are known`() {
        val result = regions("a\nb\n", "a\nb\n")

        assertTrue(result != null && result.isEmpty())
    }

    @Test
    fun `a comparison that fails for another reason also leaves the regions unknown`() {
        val result = DiffRegions.regionsFrom("a", "b") { _, _ -> throw IllegalStateException("boom") }

        assertNull(result)
    }

    @Test
    fun `texts too large to compare leave the regions unknown rather than empty`() {
        val result = DiffRegions.regionsFrom("a", "b") { _, _ -> throw DiffTooBigException() }

        assertNull(result)
    }
}
