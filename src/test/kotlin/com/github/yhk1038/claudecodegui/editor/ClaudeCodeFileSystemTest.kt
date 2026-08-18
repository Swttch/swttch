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
        // During startup the platform asks for every persisted URL. Minting a file
        // here would reopen tabs the user had closed before shutdown, so an unknown
        // ID must answer null and let the platform skip that entry.
        val fs = ClaudeCodeFileSystem()

        assertNull(fs.findFileByPath("no-such-tab"))
        assertNull(fs.refreshAndFindFileByPath("no-such-tab"))
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
