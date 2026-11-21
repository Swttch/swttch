package com.github.yhk1038.claudecodegui.hosting

import com.intellij.openapi.project.Project
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * Pure-logic tests for the chat-host router.
 *
 * The router has two testable decisions that are deliberately extracted from
 * any IDE API call (mirroring the existing `newTab` / `RealizationGate`
 * pattern in this codebase):
 *
 * 1. [ChatHostRouter.selectHost] — given a [HostMode] and the available hosts,
 *    pick the right [ChatHost]. This is the spine of Phase 2–4: a host is
 *    *chosen* here, then *delegated to* by `OpenClaudeCodeAction.focusTab`.
 * 2. [ChatHostRouter.planRestoreOrder] — the restart-restore ordering that used
 *    to live inline in `EditorTabRestoreActivity`: inactive tabs first (in
 *    their original order), the active tab last so it wins focus.
 *
 * Neither decision touches `FileEditorManager`, `ToolWindow`, or any live IDE
 * service, so they run as plain unit tests with no platform harness.
 */
class ChatHostRouterTest {

    /** A no-op [ChatHost]; identity is all `selectHost` cares about. */
    private fun fakeHost(): ChatHost = object : ChatHost {
        override fun openOrFocus(project: Project, tabId: String, initialPath: String?, initialTitle: String?) {}
        override fun restorePersistedSessions(project: Project) {}
    }

    @Nested
    inner class SelectHost {

        @Test
        fun `EDITOR_TAB picks the editor-tab host`() {
            val editorTabHost = fakeHost()
            val toolWindowHost = fakeHost()

            assertSame(
                editorTabHost,
                ChatHostRouter.selectHost(HostMode.EDITOR_TAB, editorTabHost, toolWindowHost)
            )
        }

        @Test
        fun `TOOL_WINDOW picks the tool-window host when present`() {
            val editorTabHost = fakeHost()
            val toolWindowHost = fakeHost()

            assertSame(
                toolWindowHost,
                ChatHostRouter.selectHost(HostMode.TOOL_WINDOW, editorTabHost, toolWindowHost)
            )
        }

        @Test
        fun `TOOL_WINDOW falls back to the editor-tab host when no tool-window host exists yet`() {
            // Phase 2/3 reality: the tool-window host is not implemented until
            // Phase 4. Selecting TOOL_WINDOW before then must degrade safely to
            // the editor-tab host rather than NPE.
            val editorTabHost = fakeHost()

            assertSame(
                editorTabHost,
                ChatHostRouter.selectHost(HostMode.TOOL_WINDOW, editorTabHost, toolWindowHost = null)
            )
        }
    }

    @Nested
    inner class PlanRestoreOrder {

        @Test
        fun `active tab is restored last so it wins focus`() {
            assertEquals(
                listOf("a", "c", "b"),
                ChatHostRouter.planRestoreOrder(openTabIds = listOf("a", "b", "c"), activeTabId = "b")
            )
        }

        @Test
        fun `inactive tabs keep their original order`() {
            assertEquals(
                listOf("a", "b", "c", "d"),
                ChatHostRouter.planRestoreOrder(openTabIds = listOf("a", "b", "c", "d"), activeTabId = "d")
            )
        }

        @Test
        fun `null active tab restores everything in original order`() {
            assertEquals(
                listOf("a", "b", "c"),
                ChatHostRouter.planRestoreOrder(openTabIds = listOf("a", "b", "c"), activeTabId = null)
            )
        }

        @Test
        fun `unknown active tab not in the open list is ignored`() {
            assertEquals(
                listOf("a", "b", "c"),
                ChatHostRouter.planRestoreOrder(openTabIds = listOf("a", "b", "c"), activeTabId = "x")
            )
        }

        @Test
        fun `single active tab restores once, not twice`() {
            assertEquals(
                listOf("a"),
                ChatHostRouter.planRestoreOrder(openTabIds = listOf("a"), activeTabId = "a")
            )
        }

        @Test
        fun `empty open list yields empty plan`() {
            assertEquals(
                emptyList<String>(),
                ChatHostRouter.planRestoreOrder(openTabIds = emptyList(), activeTabId = "a")
            )
        }
    }

    @Nested
    inner class PlanOpen {

        @Test
        fun `no open tabs mints the new tab id`() {
            assertEquals(
                "new",
                ChatHostRouter.planOpen(openTabIds = emptyList(), activeTabId = null, newTabId = "new")
            )
        }

        @Test
        fun `an open tab focuses the active one instead of opening a new tab`() {
            assertEquals(
                "b",
                ChatHostRouter.planOpen(openTabIds = listOf("a", "b", "c"), activeTabId = "b", newTabId = "new")
            )
        }

        @Test
        fun `null active id falls back to the most recently opened tab`() {
            assertEquals(
                "c",
                ChatHostRouter.planOpen(openTabIds = listOf("a", "b", "c"), activeTabId = null, newTabId = "new")
            )
        }

        @Test
        fun `stale active id not in the open list falls back to the most recent tab`() {
            assertEquals(
                "c",
                ChatHostRouter.planOpen(openTabIds = listOf("a", "b", "c"), activeTabId = "x", newTabId = "new")
            )
        }
    }

    @Nested
    inner class PlanHydrate {

        @Test
        fun `no persisted sessions opens one fresh session`() {
            assertEquals(
                ChatHostRouter.HydratePlan.FreshSession,
                ChatHostRouter.planHydrate(openTabIds = emptyList(), activeTabId = null)
            )
        }

        @Test
        fun `persisted sessions are restored in restore order`() {
            assertEquals(
                ChatHostRouter.HydratePlan.Restore(listOf("a", "c", "b")),
                ChatHostRouter.planHydrate(openTabIds = listOf("a", "b", "c"), activeTabId = "b")
            )
        }
    }
}
