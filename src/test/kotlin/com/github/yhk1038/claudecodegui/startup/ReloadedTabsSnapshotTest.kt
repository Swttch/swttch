package com.github.yhk1038.claudecodegui.startup

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReloadedTabsSnapshotTest {

    @Test
    fun `tabs survive a round trip in order`() {
        val tabs = listOf(
            ReloadedTab("tab-1", "/sessions/abc?x=1", "First chat"),
            ReloadedTab("tab-2", null, null),
            ReloadedTab("tab-3", "/sessions/new", "Title with\ttab, newline\n and 한글"),
        )

        assertEquals(tabs, ReloadedTabsSnapshot.decode(ReloadedTabsSnapshot.encode(tabs)))
    }

    @Test
    fun `nothing remembered decodes to no tabs`() {
        assertTrue(ReloadedTabsSnapshot.decode(null).isEmpty())
        assertTrue(ReloadedTabsSnapshot.decode("").isEmpty())
        assertTrue(ReloadedTabsSnapshot.decode(ReloadedTabsSnapshot.encode(emptyList())).isEmpty())
    }

    @Test
    fun `editor tab mode keeps only the recorded tabs that are really open`() {
        val recorded = listOf("stale", "open-1", "open-2")
        val openEditors = setOf("open-1", "open-2", "diff-tab")

        assertEquals(listOf("open-1", "open-2"), ReloadedTabsSnapshot.selectOpenTabs(recorded, openEditors, editorTabMode = true))
    }

    @Test
    fun `tool window mode keeps the recorded tabs because they are not editors`() {
        assertEquals(listOf("a", "b"), ReloadedTabsSnapshot.selectOpenTabs(listOf("a", "b"), emptySet(), editorTabMode = false))
    }

    @Test
    fun `a record without a tab id is dropped`() {
        assertEquals(
            listOf(ReloadedTab("tab-1", null, null)),
            ReloadedTabsSnapshot.decode("tab-1\t\t\n\t%2Fsessions%2Fx\t"),
        )
    }
}
