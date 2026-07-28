package com.github.yhk1038.claudecodegui.settings

import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.json.*
import java.io.File

/**
 * Reads a single value out of a project's own settings file
 * (`<project>/.claude-code-gui/settings.json`, plain JSON — the same file the Node
 * backend writes for project scope).
 *
 * **Why the IDE reads this at all.** The backend is the single source of truth for
 * settings (CLAUDE.md), so the IDE normally asks it. `nodePath` is the one exception:
 * it decides which `node` *launches* that backend, so it must be resolved before any
 * backend exists to ask (#22). Honouring the project scope for it therefore requires
 * the IDE to look at the project file directly.
 *
 * Keep this narrow. It is a single-key lookup with no merge policy of its own — the
 * caller falls back to the global value when this returns null — precisely so the
 * backend's merge rules are not duplicated on the Kotlin side.
 */
object ProjectSettingsReader {

    private val logger = Logger.getInstance(ProjectSettingsReader::class.java)

    private val lenientJson = Json {
        isLenient = true
        ignoreUnknownKeys = true
    }

    /**
     * The string value of [key] in [projectPath]'s settings file, or null when the
     * project sets nothing (no file, no key, JSON null, or a non-string value).
     *
     * Never throws: a corrupt project file must not stop the backend from launching —
     * the caller simply falls back to the global setting.
     */
    fun read(projectPath: String?, key: String): String? {
        if (projectPath.isNullOrBlank()) return null

        val file = File(File(projectPath, ".claude-code-gui"), "settings.json")
        if (!file.isFile) return null

        return try {
            val root = lenientJson.parseToJsonElement(file.readText()) as? JsonObject ?: return null
            (root[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            logger.warn("Ignoring unreadable project settings: ${file.absolutePath}", e)
            null
        }
    }
}
