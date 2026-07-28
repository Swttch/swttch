package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Regression guard for issue #7: an IDE-side settings write must not erase keys the
 * IDE does not know about.
 *
 * The Node backend owns the settings schema (23 keys). [SettingsManager] declares
 * only the 9 its own Settings dialog edits. Serializing a write from the IDE's map
 * alone therefore drops every backend-only key — `hostMode` among them — silently
 * resetting a user's "Sidebar" choice to "editor-tab" the moment they save a CLI
 * path from Settings → Tools → Claude Code.
 *
 * [SettingsManager.mergeForWrite] is the seam that fixes this: it folds the pending
 * edits onto whatever is already on disk. These tests pin that contract without
 * needing the IntelliJ service container.
 */
class SettingsFileMergeTest {

    /** A settings.js as the Node backend writes it — carries backend-only keys. */
    private val backendWritten = """
        // ~/.claude-code-gui/settings.js
        export default {
          cliPath: null,
          hostMode: "tool-window",
          openSettingsAs: "overlay",
          uiLanguage: "korean",
          autoResumeOnLimit: true,
        };
    """.trimIndent()

    @Test
    fun `edits fold onto the on-disk values instead of replacing them`() {
        val onDisk = JsSettingsParser.parse(backendWritten)

        val merged = SettingsManager.mergeForWrite(
            onDisk = onDisk,
            edits = mapOf("cliPath" to JsonPrimitive("/usr/local/bin/claude")),
        )

        // The edit landed.
        assertEquals(JsonPrimitive("/usr/local/bin/claude"), merged["cliPath"])
        // Every backend-only key survived.
        assertEquals(JsonPrimitive("tool-window"), merged["hostMode"])
        assertEquals(JsonPrimitive("overlay"), merged["openSettingsAs"])
        assertEquals(JsonPrimitive("korean"), merged["uiLanguage"])
        assertEquals(JsonPrimitive(true), merged["autoResumeOnLimit"])
    }

    @Test
    fun `a full write-out round-trip keeps every backend-only key`() {
        val onDisk = JsSettingsParser.parse(backendWritten)
        val merged = SettingsManager.mergeForWrite(
            onDisk = onDisk,
            edits = mapOf("nodePath" to JsonPrimitive("/usr/local/bin/node")),
        )

        val reparsed = JsSettingsParser.parse(JsSettingsParser.generate(merged, emptyMap()))

        assertEquals(JsonPrimitive("/usr/local/bin/node"), reparsed["nodePath"])
        assertEquals(JsonPrimitive("tool-window"), reparsed["hostMode"])
        assertEquals(JsonPrimitive("korean"), reparsed["uiLanguage"])
    }

    @Test
    fun `keys missing from disk fall back to defaults, never dropped`() {
        // A file written by an older build that predates a key still yields that key,
        // so generate() does not emit a file with holes in it.
        val onDisk = JsSettingsParser.parse("""export default { hostMode: "tool-window" };""")

        val merged = SettingsManager.mergeForWrite(onDisk = onDisk, edits = emptyMap())

        assertEquals(JsonPrimitive("tool-window"), merged["hostMode"])
        assertTrue(merged.containsKey("theme"))
        assertTrue(merged.containsKey("fontSize"))
    }

    @Test
    fun `an empty disk map yields the IDE defaults`() {
        val merged = SettingsManager.mergeForWrite(onDisk = emptyMap(), edits = emptyMap())

        assertEquals(JsonPrimitive("editor-tab"), merged["hostMode"])
        assertEquals(JsonPrimitive("system"), merged["theme"])
    }

    @Test
    fun `edits win over both disk and defaults`() {
        val onDisk = JsSettingsParser.parse("""export default { theme: "dark" };""")

        val merged = SettingsManager.mergeForWrite(
            onDisk = onDisk,
            edits = mapOf("theme" to JsonPrimitive("light")),
        )

        assertEquals(JsonPrimitive("light"), merged["theme"])
    }
}
