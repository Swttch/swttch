package com.github.yhk1038.claudecodegui.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Pins the URL round trip that lets the IDE restore a chat tab into the editor
 * splitter it was in before a restart (issue #302).
 *
 * The platform persists an open tab by URL and revives it with
 * `VirtualFileManager.findFileByUrl`, which splits the URL on `://`, looks the
 * file system up by protocol, and calls `findFileByPath` with the remainder.
 * These tests exercise both halves of that contract without an IDE fixture:
 * the URL we emit, and the lookup that must resolve it back.
 */
class ClaudeCodeFileSystemTest {

    @Test
    fun `protocol matches the plugin_xml registration key`() {
        // The platform resolves a URL by looking up the file system registered
        // under the `key` attribute. If the constant and the registration ever
        // drift, restore silently stops working: the URL persists fine but no
        // file system claims the protocol, so the tab is dropped from the layout.
        val pluginXml = File("src/main/resources/META-INF/plugin.xml").readText()

        assertTrue(
            pluginXml.contains("""key="${ClaudeCodeFileSystem.PROTOCOL}""""),
            "plugin.xml must register a virtualFileSystem with key=\"${ClaudeCodeFileSystem.PROTOCOL}\"",
        )
        assertTrue(
            pluginXml.contains("implementationClass=\"com.github.yhk1038.claudecodegui.editor.ClaudeCodeFileSystem\""),
            "plugin.xml must point the registration at ClaudeCodeFileSystem",
        )
    }

    @Test
    fun `urlFor builds a URL the platform can split back into protocol and tab id`() {
        val url = ClaudeCodeFileSystem.urlFor("tab-abc")

        assertEquals("claude-code://tab-abc", url)
        // This is exactly how VirtualFileManager splits a URL.
        assertEquals(ClaudeCodeFileSystem.PROTOCOL, url.substringBefore("://"))
        assertEquals("tab-abc", url.substringAfter("://"))
    }

    @Test
    fun `unknown tab id resolves to null rather than resurrecting a closed tab`() {
        // A tab the user closed before shutdown is gone from both the in-memory
        // map and EditorTabStateService, so its URL must answer null and let the
        // platform skip that entry instead of reopening it.
        val fs = ClaudeCodeFileSystem()

        assertNull(fs.findFileByPath("no-such-tab"))
        assertNull(fs.refreshAndFindFileByPath("no-such-tab"))
    }

    @Test
    fun `empty path resolves to null instead of being treated as a tab id`() {
        val fs = ClaudeCodeFileSystem()

        assertNull(fs.findFileByPath(""))
        assertNull(fs.findFileByPath("/"))
    }

    @Test
    fun `a URL round trips through urlFor and back into findFileByPath`() {
        // Guards the seam the platform actually drives: it persists urlFor(...),
        // then on restart splits that string and hands the remainder to
        // findFileByPath. If either side ever grows a prefix or escaping, the two
        // stop lining up and restore silently degrades to "No file exists".
        val fs = ClaudeCodeFileSystem()
        val tabId = "b1aa13f4-77b7-41ca-936b-f818f4a66b40"

        val persisted = ClaudeCodeFileSystem.urlFor(tabId)
        val pathHandedBack = persisted.substringAfter("://")

        assertEquals(tabId, pathHandedBack)
        // Unknown to both lookups here, so null — but it reached the lookup as the
        // bare tab ID, which is the part this test pins.
        assertNull(fs.findFileByPath(pathHandedBack))
    }

    @Test
    fun `file system is read-only and non-physical`() {
        val fs: com.intellij.openapi.vfs.VirtualFileSystem = ClaudeCodeFileSystem()

        // NonPhysicalFileSystem keeps the platform from treating these tabs as
        // files on disk (refresh, indexing, local-history).
        assertTrue(fs is com.intellij.openapi.vfs.NonPhysicalFileSystem)
        assertTrue(fs.isReadOnly)
        assertEquals("claude-code", fs.protocol)
    }
}
