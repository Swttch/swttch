package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the Apply and Allow all edits buttons send when the diff could not tell
 * which regions changed (#620).
 *
 * The backend reads an empty list as "the reviewer kept nothing" and denies the
 * edit. Before the diff has been compared, or in a viewer that never reports its
 * changes, the selection also holds nothing, so every button ended up refusing
 * the edit. Not knowing the regions must not read as declining them.
 */
class HunkAnswerTest {

    private val oldText = "a\nb\nc\n"
    private val newText = "a\nB\nc\n"

    @Test
    fun `a selection that never learned the regions answers with the whole proposal`() {
        val selection = HunkSelection()

        val answer = selection.rangesToAnswer(oldText, newText)

        assertEquals(listOf(AcceptedRange(oldStart = 0, oldEnd = 3, newStart = 0, newEnd = 3)), answer)
    }

    @Test
    fun `regions the diff reported are answered as they are`() {
        val selection = HunkSelection()
        val region = AcceptedRange(oldStart = 1, oldEnd = 2, newStart = 1, newEnd = 2)
        selection.setRanges(listOf(region))

        assertEquals(listOf(region), selection.rangesToAnswer(oldText, newText))
    }

    @Test
    fun `a reviewer who cleared every box still keeps nothing`() {
        val selection = HunkSelection()
        selection.setRanges(listOf(AcceptedRange(oldStart = 1, oldEnd = 2, newStart = 1, newEnd = 2)))

        selection.setAll(false)

        assertTrue(selection.rangesToAnswer(oldText, newText).isEmpty())
    }

    @Test
    fun `a new file is answered as a proposal that replaces nothing`() {
        val selection = HunkSelection()

        val answer = selection.rangesToAnswer("", "x\ny")

        assertEquals(listOf(AcceptedRange(oldStart = 0, oldEnd = 0, newStart = 0, newEnd = 2)), answer)
    }

    @Test
    fun `a trailing newline is not counted as another line`() {
        val selection = HunkSelection()

        val answer = selection.rangesToAnswer("a\n", "a\nb\n")

        assertEquals(listOf(AcceptedRange(oldStart = 0, oldEnd = 1, newStart = 0, newEnd = 2)), answer)
    }
}
