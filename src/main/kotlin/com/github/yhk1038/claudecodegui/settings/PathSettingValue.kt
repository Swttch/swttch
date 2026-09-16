package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * The JSON value to store for a filesystem path typed into an IDE settings field.
 *
 * Surrounding whitespace is dropped, and a field holding nothing but whitespace becomes
 * JsonNull — the value every reader already understands as "auto-detect".
 *
 * A path copied out of a file manager or a terminal often carries a trailing space, and
 * spawn treats that space as part of the filename: "/home/u/.local/bin/claude " fails
 * with ENOENT while the same path without the space runs fine (issue #446).
 *
 * The backend applies the same rule when it saves settings, but the IDE settings dialog
 * writes the settings file directly through [SettingsManager] rather than going through
 * the backend, so the backend's normalization never sees what is typed here.
 *
 * A top-level function rather than a member of the dialog so it can be unit-tested
 * without loading a Configurable and, with it, the IntelliJ UI stack.
 */
fun pathSettingValue(raw: String): JsonElement {
    val trimmed = raw.trim()
    return if (trimmed.isEmpty()) JsonNull else JsonPrimitive(trimmed)
}
