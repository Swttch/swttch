package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

/**
 * The IDE reads `nodePath` itself, before any backend exists to ask (#22). To honour
 * the project scope it therefore has to look at the project's own settings file the
 * same way the backend's `readMergedSettings` does — project value wins, global is
 * the fallback.
 *
 * This is deliberately the ONLY settings key the IDE resolves per project: every
 * other consumer runs after the backend is up and asks it instead (CLAUDE.md — the
 * backend is the single source of truth).
 */
class ProjectSettingsReaderTest {

    @TempDir
    lateinit var tmp: Path

    private fun writeProjectSettings(projectRoot: Path, json: String) {
        val dir = projectRoot.resolve(".claude-code-gui")
        Files.createDirectories(dir)
        Files.writeString(dir.resolve("settings.json"), json)
    }

    @Test
    fun `reads a value from the project settings file`() {
        writeProjectSettings(tmp, """{ "nodePath": "/proj/.bin/node" }""")

        val value = ProjectSettingsReader.read(tmp.toString(), "nodePath")

        assertEquals("/proj/.bin/node", value)
    }

    @Test
    fun `returns null when the project sets nothing, so the caller falls back to global`() {
        writeProjectSettings(tmp, """{ "cliPath": "/proj/.bin/claude" }""")

        assertNull(ProjectSettingsReader.read(tmp.toString(), "nodePath"))
    }

    @Test
    fun `returns null when the project has no settings file at all`() {
        assertNull(ProjectSettingsReader.read(tmp.toString(), "nodePath"))
    }

    @Test
    fun `returns null for a blank or missing project path`() {
        assertNull(ProjectSettingsReader.read(null, "nodePath"))
        assertNull(ProjectSettingsReader.read("", "nodePath"))
    }

    @Test
    fun `a corrupt project file is ignored rather than crashing the backend launch`() {
        writeProjectSettings(tmp, "{ this is not json")

        assertNull(ProjectSettingsReader.read(tmp.toString(), "nodePath"))
    }

    @Test
    fun `a JSON null is treated as unset`() {
        writeProjectSettings(tmp, """{ "nodePath": null }""")

        assertNull(ProjectSettingsReader.read(tmp.toString(), "nodePath"))
    }

    @Test
    fun `a non-string value is ignored`() {
        writeProjectSettings(tmp, """{ "nodePath": 42 }""")

        assertNull(ProjectSettingsReader.read(tmp.toString(), "nodePath"))
    }
}
