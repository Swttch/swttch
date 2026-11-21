package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * `openTab(path)` goes to the tab already showing a page instead of opening a copy,
 * and what counts as "the same page" is decided here, with no IDE in the way.
 */
class FindTabShowingTest {

    private val open = listOf(
        "tab-a" to "/sessions/abc?workingDir=%2Fproj",
        "tab-b" to "/settings/general",
        "tab-c" to null,
    )

    @Test
    fun `the query does not tell two requests for the same page apart`() {
        assertEquals("tab-a", findTabShowing("/sessions/abc", open))
        assertEquals("tab-a", findTabShowing("/sessions/abc?workingDir=%2Fother", open))
    }

    @Test
    fun `a leading hash and a trailing slash are not part of the address`() {
        assertEquals("tab-b", findTabShowing("#/settings/general", open))
        assertEquals("tab-b", findTabShowing("/settings/general/", open))
    }

    @Test
    fun `another page of the same area is not the same page`() {
        assertNull(findTabShowing("/settings/sponsor", open))
        assertNull(findTabShowing("/sessions/abcd", open))
    }

    @Test
    fun `a tab that shows nothing yet matches nothing`() {
        assertNull(findTabShowing("", open))
        assertNull(findTabShowing("/", open))
    }

    @Test
    fun `the first tab showing the page wins`() {
        val twice = listOf("first" to "/sessions/x", "second" to "/sessions/x")
        assertEquals("first", findTabShowing("/sessions/x", twice))
    }
}
