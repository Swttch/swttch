package com.github.yhk1038.claudecodegui.editor

import com.intellij.testFramework.LightVirtualFile
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Pins the tab label a chat tab shows once a SECOND chat tab is open.
 *
 * `EditorTabPresentationUtil.getEditorTabTitle` resolves a label in three steps:
 * the `editorTabTitleProvider` extensions first, then the platform's unique-name
 * pass, and only then `VirtualFile.getPresentableName`. The middle step is the
 * problem: when two open tabs share a name — and every fresh chat tab is named
 * "Claude Code" until the conversation reports a title — it disambiguates them
 * through `UniqueVFilePathBuilder`, which builds its labels out of
 * `VirtualFile.getPath()`. Ours is the tab's UUID (deliberately, so a persisted
 * `claude-code://<tabId>` URL survives a restart — issue #302), so pressing "+"
 * relabelled BOTH tabs `43871f9c-1e0e-4176-8355-f8df1c09b1c7`.
 *
 * Claiming the first step keeps the platform from ever reaching the unique-name
 * pass for our files. Two tabs named "Claude Code" is the intended presentation
 * — the same as two untitled chats in Cursor.
 */
class ClaudeCodeEditorTabTitleProviderTest {

    private val provider = ClaudeCodeEditorTabTitleProvider()

    @Test
    fun `a chat tab is labelled by its display name, never by its UUID path`() {
        val file = ClaudeCodeVirtualFile("43871f9c-1e0e-4176-8355-f8df1c09b1c7", initialTitle = "Fix the parser")

        assertEquals("Fix the parser", ClaudeCodeEditorTabTitleProvider.titleFor(file))
    }

    @Test
    fun `an untitled chat tab is labelled with the app name, not its UUID path`() {
        // The reported symptom: a tab opened with "+" has no conversation title
        // yet, so it falls back to "Claude Code" — which is exactly the collision
        // that used to send the platform looking for a unique path.
        val file = ClaudeCodeVirtualFile("43871f9c-1e0e-4176-8355-f8df1c09b1c7")

        assertEquals("Claude Code", ClaudeCodeEditorTabTitleProvider.titleFor(file))
    }

    @Test
    fun `two untitled tabs keep the same label instead of being disambiguated by UUID`() {
        // The unique-name pass only fires when open tabs share a name, so this is
        // the case that regressed. Both must still answer the shared label here:
        // returning it at all is what stops the platform from disambiguating.
        val first = ClaudeCodeVirtualFile("43871f9c-1e0e-4176-8355-f8df1c09b1c7")
        val second = ClaudeCodeVirtualFile("ae094c4e-a59e-4682-bb88-a199b154933a")

        assertEquals("Claude Code", ClaudeCodeEditorTabTitleProvider.titleFor(first))
        assertEquals("Claude Code", ClaudeCodeEditorTabTitleProvider.titleFor(second))
    }

    @Test
    fun `a long conversation title is truncated the same way the tab already truncated it`() {
        // The label still comes from the file's display name, so the existing
        // truncation is inherited rather than re-implemented here.
        val file = ClaudeCodeVirtualFile("tab-1", initialTitle = "A conversation title far longer than the tab allows")

        val title = ClaudeCodeEditorTabTitleProvider.titleFor(file)

        assertEquals(file.presentableName, title)
        assertTrue(title!!.endsWith("…"), "expected the inherited truncation, got: $title")
    }

    @Test
    fun `other files are left to the platform`() {
        // Returning anything for a file that is not ours would hijack every tab in
        // the IDE — including the unique-name disambiguation that genuinely helps
        // when two real files share a name.
        assertNull(ClaudeCodeEditorTabTitleProvider.titleFor(LightVirtualFile("Main.kt", "")))
    }

    @Test
    fun `provider is registered in plugin_xml`() {
        // The class alone changes nothing: the platform only consults providers
        // declared under the extension point. Same failure mode as the file-system
        // registration — silent, and only visible once a second tab is open.
        val pluginXml = File("src/main/resources/META-INF/plugin.xml").readText()

        assertTrue(
            pluginXml.contains(
                "<editorTabTitleProvider implementation=\"" +
                    "com.github.yhk1038.claudecodegui.editor.ClaudeCodeEditorTabTitleProvider\"/>",
            ),
            "plugin.xml must register ClaudeCodeEditorTabTitleProvider under editorTabTitleProvider",
        )
    }
}
