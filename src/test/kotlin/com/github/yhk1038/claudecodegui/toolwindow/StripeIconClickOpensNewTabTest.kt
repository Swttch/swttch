package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * Verifies the stripe icon click behaviour described in GitHub issue #47.
 *
 * The stripe icon (activity bar) must ALWAYS open a new tab — identical to the
 * "+" button — regardless of how many Claude Code tabs are currently open.
 *
 * ### Why not test ClaudeCodeToolWindowFactory directly?
 * `ClaudeCodeToolWindowFactory.createToolWindowContent` depends on live IDE APIs
 * (FileEditorManager, ToolWindowManager, MessageBus) that are unavailable without
 * a full `BasePlatformTestCase` / light-platform harness. Spinning up the IDE
 * platform just to assert "did we call focusTab?" is fragile and slow.
 *
 * ### Strategy: extract the decision, inject the side-effect
 * The function under test is [newTab], a pure-logic wrapper extracted from
 * `ClaudeCodeToolWindowFactory`. It accepts a `tabOpener` lambda so tests can
 * substitute a recording fake in place of `OpenClaudeCodeAction.focusTab`.
 *
 * This mirrors the existing pattern in the codebase (e.g. RealizationGate):
 * keep IDE-aware plumbing in the factory, move the testable decision into a
 * standalone function.
 */
class StripeIconClickOpensNewTabTest {

    /**
     * Records every (project, tabId) invocation of the injected tabOpener.
     */
    private class TabOpenerSpy {
        val calls = mutableListOf<Pair<Any?, String>>()

        fun record(project: Any?, tabId: String) {
            calls.add(project to tabId)
        }
    }

    @Nested
    inner class AlwaysOpensNewTab {

        @Test
        fun `newTab calls tabOpener exactly once`() {
            val spy = TabOpenerSpy()
            newTab<Any?>(project = null, tabOpener = { project, tabId -> spy.record(project, tabId) })

            assertEquals(1, spy.calls.size, "tabOpener must be called exactly once")
        }

        @Test
        fun `newTab generates a non-blank tabId`() {
            var capturedTabId: String? = null
            newTab<Any?>(project = null, tabOpener = { _, tabId -> capturedTabId = tabId })

            val id = capturedTabId
            assert(id != null && id.isNotBlank()) { "tabId must be a non-blank UUID string, got: $id" }
        }

        @Test
        fun `newTab generates a unique tabId on every invocation`() {
            val ids = mutableListOf<String>()
            repeat(5) {
                newTab<Any?>(project = null, tabOpener = { _, tabId -> ids.add(tabId) })
            }

            assertEquals(5, ids.distinct().size, "Every call must produce a unique tabId")
        }

        @Test
        fun `newTab forwards the project to tabOpener`() {
            val sentinel = "sentinel-project"
            var capturedProject: String? = null
            newTab(project = sentinel, tabOpener = { project, _ -> capturedProject = project })

            assertEquals(sentinel, capturedProject)
        }
    }

    @Nested
    inner class NeverFocusesExistingTab {

        /**
         * The old `focusOrOpenClaudeCodeTab` would check openFiles and skip opening
         * a new tab if a Claude tab was already visible. This test documents that
         * the new [newTab] function has NO such conditional — it always opens.
         *
         * We simulate "there are already open tabs" by calling newTab multiple
         * times and verifying the tabOpener is invoked each time.
         */
        @Test
        fun `newTab always opens even when called multiple times in a row`() {
            val spy = TabOpenerSpy()
            repeat(3) {
                newTab<Any?>(project = null, tabOpener = { project, tabId -> spy.record(project, tabId) })
            }

            assertEquals(
                3,
                spy.calls.size,
                "Each stripe icon click must open a new tab, not focus an existing one"
            )
        }
    }
}
