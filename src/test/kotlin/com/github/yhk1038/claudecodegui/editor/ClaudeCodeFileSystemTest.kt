package com.github.yhk1038.claudecodegui.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
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
    fun `a tab resolves with no project open, which is when the platform asks`() {
        // Issue #312. The platform restores the editor layout while the project
        // is still opening: a logged run showed ProjectManager.openProjects empty
        // at the moment of the lookup and the project appearing there 3.8s LATER.
        // So a lookup that needs an open project to answer never answers, the
        // platform logs "No file exists: claude-code://..." and drops the tab —
        // and with it the splitter it was in, which is what the reporter saw.
        //
        // Resolving a tab must therefore not depend on project state. This test
        // runs with no application and no project at all, exactly the emptiness
        // the real restore hits.
        val fs = ClaudeCodeFileSystem()
        val tabId = "77816be2-84a0-4056-8955-763c361b3c97"

        val file = fs.findFileByPath(tabId)

        assertNotNull(file, "a persisted chat tab must resolve even before any project is open")
        assertEquals(tabId, (file as ClaudeCodeVirtualFile).tabId)
        assertEquals(ClaudeCodeFileSystem.urlFor(tabId), file.url)
    }

    @Test
    fun `the same tab id always resolves to the same file`() {
        // The platform compares files by identity in places (detaching a browser
        // component from its old parent, for one), and two files for one tab
        // would each carry their own display name and path. Whoever asks first
        // mints it; everyone after gets that same instance.
        val fs = ClaudeCodeFileSystem()
        val tabId = "3d3f1a2c-0000-4000-8000-000000000001"

        val first = fs.findFileByPath(tabId)
        val second = fs.refreshAndFindFileByPath(tabId)

        assertNotNull(first)
        assertSame(first, second)
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
        // And the lookup answers with that same tab, which is the whole point of
        // the round trip: the platform gets a file back to put in the layout.
        val resolved = fs.findFileByPath(pathHandedBack)
        assertNotNull(resolved)
        assertEquals(tabId, (resolved as ClaudeCodeVirtualFile).tabId)
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
