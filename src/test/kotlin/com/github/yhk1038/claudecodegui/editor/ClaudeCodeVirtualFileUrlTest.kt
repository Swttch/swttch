package com.github.yhk1038.claudecodegui.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/**
 * Pins the identity a chat tab is persisted under (issue #302).
 *
 * Before this fix the file inherited `LightVirtualFile`'s identity: protocol
 * `mock` (not registered under the virtualFileSystem extension point, and its
 * `findFileByPath` returns null unconditionally) and a path derived from the
 * display name. The IDE therefore could not revive the tab from its persisted
 * URL, dropped it from the restored layout, and the plugin re-opened it in the
 * default splitter — the reported symptom.
 */
class ClaudeCodeVirtualFileUrlTest {

    @Test
    fun `url is the registered protocol plus the tab id`() {
        val file = ClaudeCodeVirtualFile("tab-1")

        assertEquals("claude-code://tab-1", file.url)
        assertEquals("claude-code", file.fileSystem.protocol)
    }

    @Test
    fun `path is the tab id, not the display name`() {
        val file = ClaudeCodeVirtualFile("tab-1", initialTitle = "Fix the parser")

        // The display name follows the conversation and changes as the user works.
        // Deriving the path from it (LightVirtualFile's behaviour) produced a URL
        // that no longer matched on the next start.
        assertEquals("tab-1", file.path)
        assertNotEquals(file.name, file.path)
    }

    @Test
    fun `url is independent of the display name, so renaming cannot break restore`() {
        // setDisplayName itself needs a running application (it fires a VFS
        // property change), so the invariant is asserted structurally instead:
        // two files with the same tab ID but different titles share one URL.
        val before = ClaudeCodeVirtualFile("tab-1", initialTitle = "Before")
        val after = ClaudeCodeVirtualFile("tab-1", initialTitle = "After renaming the conversation")

        assertNotEquals(before.name, after.name)
        assertEquals(before.url, after.url)
        assertEquals("claude-code://tab-1", after.url)
    }

    @Test
    fun `identity is the tab id, so two files for one tab are equal`() {
        // getOrCreate caches per tab, but restore and an open tab must agree that
        // they are the same file even if two instances ever exist.
        assertEquals(ClaudeCodeVirtualFile("tab-1"), ClaudeCodeVirtualFile("tab-1"))
        assertNotEquals(ClaudeCodeVirtualFile("tab-1"), ClaudeCodeVirtualFile("tab-2"))
    }
}
