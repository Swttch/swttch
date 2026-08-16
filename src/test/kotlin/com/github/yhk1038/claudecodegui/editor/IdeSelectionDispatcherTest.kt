package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.actions.EditorContextPayload
import com.intellij.testFramework.LightVirtualFile
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * Pure unit tests for the payload-building logic used by [IdeSelectionDispatcher].
 *
 * The dispatcher itself depends on IntelliJ platform APIs (FileEditorManager,
 * EditorFactory, Alarm) that cannot be used without a full platform test harness.
 * These tests focus on the pure logic: payload construction and constant values.
 */
class IdeSelectionDispatcherTest {

    @Test
    fun `DEBOUNCE_MS should be a positive value within reasonable range`() {
        val ms = IdeSelectionDispatcher.DEBOUNCE_MS
        assertTrue(ms in 50..500, "DEBOUNCE_MS=$ms should be between 50 and 500 ms")
    }

    /**
     * The Gate 2 consumer check: an ide-selection push has a consumer when
     * EITHER a Claude Code editor tab is open OR the Claude Code tool window is
     * visible. The platform lookups that produce the two booleans live in the
     * dispatcher's call site; this pure predicate is what decides dispatch.
     *
     * Before this fix the gate only considered the editor-tab case, so users who
     * ran Claude solely in the tool window never got the context chip.
     */
    @Nested
    inner class ConsumerGate {

        @Test
        fun `dispatches when a Claude Code editor tab is open`() {
            assertTrue(IdeSelectionDispatcher.hasSelectionConsumer(hasClaudeEditorTab = true, isToolWindowVisible = false))
        }

        @Test
        fun `dispatches when the Claude Code tool window is visible`() {
            assertTrue(IdeSelectionDispatcher.hasSelectionConsumer(hasClaudeEditorTab = false, isToolWindowVisible = true))
        }

        @Test
        fun `dispatches when both an editor tab and the tool window are present`() {
            assertTrue(IdeSelectionDispatcher.hasSelectionConsumer(hasClaudeEditorTab = true, isToolWindowVisible = true))
        }

        @Test
        fun `suppresses when neither an editor tab nor the tool window is present`() {
            assertFalse(IdeSelectionDispatcher.hasSelectionConsumer(hasClaudeEditorTab = false, isToolWindowVisible = false))
        }
    }

    /**
     * The dedup cache reset contract. When the webview (the selection chip
     * consumer) reloads, its on-screen chips disappear, so the dispatcher's
     * [IdeSelectionDispatcher.clearDedupCache] must wipe the last-dispatched key
     * to let the next identical dispatch through (otherwise a same-file focus
     * with no selection would be deduped away and the chip would never reappear).
     *
     * The `lastDispatched` field is private and the only path that mutates it
     * ([IdeSelectionDispatcher] doDispatch) requires the platform harness, so
     * here we assert the public reset contract: it runs without throwing and is
     * safe to call repeatedly (idempotent).
     */
    @Nested
    inner class DedupCacheReset {

        @Test
        fun `clearDedupCache runs without throwing`() {
            assertDoesNotThrow { IdeSelectionDispatcher.clearDedupCache() }
        }

        @Test
        fun `clearDedupCache is idempotent across repeated calls`() {
            assertDoesNotThrow {
                IdeSelectionDispatcher.clearDedupCache()
                IdeSelectionDispatcher.clearDedupCache()
                IdeSelectionDispatcher.clearDedupCache()
            }
        }
    }

    /**
     * The "sync on open" contract for [IdeSelectionDispatcher.dispatchActiveEditor].
     *
     * When the tool window opens (webview reload), the dispatcher re-queries the
     * IDE's current active file and pushes it so the backend's lastIdeSelection is
     * synchronized to whatever the user is viewing NOW — not the stale file that
     * was focused just before the window closed. The proceed/no-op decision is the
     * pure predicate [IdeSelectionDispatcher.shouldDispatchActiveEditor]:
     *
     *  - no active file (null)        → no-op
     *  - the Claude panel's own file  → no-op (not a real source file)
     *  - a real editor file           → proceed to dispatch
     *
     * The platform reads (FileEditorManager) and the Alarm live behind this
     * predicate, so this is the unit-testable contract without a platform harness.
     */
    @Nested
    inner class DispatchActiveEditorGate {

        @Test
        fun `no-op when there is no active file`() {
            assertFalse(IdeSelectionDispatcher.shouldDispatchActiveEditor(null))
        }

        @Test
        fun `no-op when the active file is the Claude panel virtual file`() {
            val claudeFile = ClaudeCodeVirtualFile(tabId = "tab-1")
            assertFalse(IdeSelectionDispatcher.shouldDispatchActiveEditor(claudeFile))
        }

        @Test
        fun `proceeds when the active file is a real editor file`() {
            val realFile = LightVirtualFile("App.kt", "fun main() {}")
            assertTrue(IdeSelectionDispatcher.shouldDispatchActiveEditor(realFile))
        }
    }

    @Nested
    inner class SelectionPayloadGatingLogic {

        /**
         * When the user switches to a tab without making a text selection,
         * the dispatcher sends null for all selection fields. Verify that
         * [EditorContextPayload.buildSelectionPayload] produces the correct
         * JSON null placeholders in this "file-only" scenario.
         */
        @Test
        fun `tab-switch without selection produces null selection fields`() {
            val absolutePath = "/home/dev/project/src/App.kt"
            val workingDir = "/home/dev/project"
            val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)

            val payload = EditorContextPayload.buildSelectionPayload(
                absolutePath = absolutePath,
                relativePath = relativePath,
                startLine = null,
                endLine = null,
                selectedText = null,
                workingDir = workingDir
            )

            assertEquals(JsonNull, payload["startLine"])
            assertEquals(JsonNull, payload["endLine"])
            assertEquals(JsonNull, payload["selectedText"])
            assertEquals(JsonPrimitive(absolutePath), payload["absolutePath"])
            assertEquals(JsonPrimitive("src/App.kt"), payload["relativePath"])
            assertEquals(JsonPrimitive(workingDir), payload["workingDir"])
        }

        /**
         * When the user drags to select text, all selection fields are populated.
         */
        @Test
        fun `text selection produces populated selection fields`() {
            val absolutePath = "/home/dev/project/src/App.kt"
            val workingDir = "/home/dev/project"
            val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)

            val payload = EditorContextPayload.buildSelectionPayload(
                absolutePath = absolutePath,
                relativePath = relativePath,
                startLine = 12,
                endLine = 18,
                selectedText = "fun greet() {\n    println(\"Hello\")\n}",
                workingDir = workingDir
            )

            assertEquals(JsonPrimitive(12), payload["startLine"])
            assertEquals(JsonPrimitive(18), payload["endLine"])
            assertEquals(
                JsonPrimitive("fun greet() {\n    println(\"Hello\")\n}"),
                payload["selectedText"]
            )
        }

        /**
         * Single-line selection (startLine == endLine) is valid.
         */
        @Test
        fun `single-line selection has equal startLine and endLine`() {
            val payload = EditorContextPayload.buildSelectionPayload(
                absolutePath = "/proj/Main.kt",
                relativePath = "Main.kt",
                startLine = 7,
                endLine = 7,
                selectedText = "val answer = 42",
                workingDir = "/proj"
            )
            assertEquals(JsonPrimitive(7), payload["startLine"])
            assertEquals(JsonPrimitive(7), payload["endLine"])
        }

        /**
         * When the file is outside workingDir, relativePath falls back to absolutePath.
         * The dispatcher still sends a valid payload.
         */
        @Test
        fun `file outside workingDir uses absolutePath as relativePath`() {
            val absolutePath = "/tmp/scratch/test.kt"
            val workingDir = "/home/dev/project"
            val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)

            // No prefix match → relativePath == absolutePath
            assertEquals(absolutePath, relativePath)

            val payload = EditorContextPayload.buildSelectionPayload(
                absolutePath = absolutePath,
                relativePath = relativePath,
                startLine = null,
                endLine = null,
                selectedText = null,
                workingDir = workingDir
            )
            assertEquals(JsonPrimitive(absolutePath), payload["relativePath"])
        }

        /**
         * Verifies the schema contract: all 6 fields are always present.
         */
        @Test
        fun `payload always contains all required schema fields`() {
            val payload = EditorContextPayload.buildSelectionPayload(
                absolutePath = "/a/b.kt",
                relativePath = "b.kt",
                startLine = null,
                endLine = null,
                selectedText = null,
                workingDir = "/a"
            )
            val requiredKeys = setOf(
                "absolutePath", "relativePath",
                "startLine", "endLine", "selectedText", "workingDir",
                "isGitignored"
            )
            assertEquals(requiredKeys, payload.keys)
        }
    }
}
