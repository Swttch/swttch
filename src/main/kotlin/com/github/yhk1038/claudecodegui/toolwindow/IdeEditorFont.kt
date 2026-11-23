package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.GraphicsEnvironment

/**
 * The fonts of the IDE, as the WebView receives them (issue #729).
 *
 * The font settings can follow the IDE: the chat font takes the font of the IDE's own interface, and the code font the
 * font of its editor. The host reads the names and hands them over as the CSS variables `--ccg-ide-ui-font` and
 * `--ccg-ide-editor-font`, next to the IDE colors. It also hands over the names of the font families installed on the
 * computer, for the dropdowns of the font settings.
 *
 * All of it is written into a script text, so only a name made of the characters a font name is made of gets through;
 * anything else is left out.
 */
internal object IdeEditorFont {

    /** Letters, digits, spaces, dots, hyphens and underscores, up to 100 characters. */
    private val SAFE_NAME = Regex("^[\\p{L}\\p{N} ._-]{1,100}$")

    /**
     * The CSS value (the name in double quotes) for [name], or null when there is no safe name to hand over. A name that
     * starts with a dot is one of the system's internal font names (macOS has `.AppleSystemUIFont`), which a web page
     * cannot ask for, so it gives nothing.
     */
    fun cssValueOrNull(name: String?): String? {
        val trimmed = name?.trim() ?: return null
        if (trimmed.startsWith(".")) return null
        if (!SAFE_NAME.matches(trimmed)) return null
        return "\"$trimmed\""
    }

    /** The names in [names] that are safe to hand over, each once, in alphabetical order. */
    fun safeFamilies(names: Array<String>): List<String> =
        names.map { it.trim() }
            .filter { !it.startsWith(".") && SAFE_NAME.matches(it) }
            .distinct()
            .sortedBy { it.lowercase() }

    /** A JavaScript array of the safe names, such as `["Arial","Menlo"]`. Safe names hold no quote or backslash. */
    fun jsArrayLiteral(names: Array<String>): String =
        safeFamilies(names).joinToString(prefix = "[", postfix = "]", separator = ",") { "\"$it\"" }

    /** The script that sets `window.__IDE_FONT_FAMILIES__`; the system's font list does not change while the IDE runs. */
    val installedFamiliesScript: String by lazy {
        val names = try {
            GraphicsEnvironment.getLocalGraphicsEnvironment().availableFontFamilyNames
        } catch (e: Exception) {
            emptyArray()
        }
        "window.__IDE_FONT_FAMILIES__ = ${jsArrayLiteral(names)};"
    }
}
