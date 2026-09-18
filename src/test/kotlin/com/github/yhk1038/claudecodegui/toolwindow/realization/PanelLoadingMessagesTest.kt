package com.github.yhk1038.claudecodegui.toolwindow.realization

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Guards the panel loading catalog against the two ways it can silently rot: a key the
 * Kotlin side asks for that no longer exists in the JSON, and a locale that never got a
 * translation for a key the others have.
 *
 * Reads `webview/src/i18n/locales` directly rather than the copied plugin resources, so a
 * missing translation fails here without first requiring a full webview build.
 */
class PanelLoadingMessagesTest {

    private val json = Json { ignoreUnknownKeys = true }

    /** Every key the Kotlin side looks up. Kept in lockstep with the catalog below. */
    private val keysUsedByKotlin: Set<String> =
        LoadingPhase.entries.map { it.key }.toSet() + setOf(
            StuckHintKeys.STILL_INDEXING,
            StuckHintKeys.STILL_INDEXING_ACTION,
            StuckHintKeys.INDEXING_DONE,
            StuckHintKeys.INDEXING_DONE_ACTION,
        )

    private val localesDir: File
        get() = File(System.getProperty("user.dir"), "webview/src/i18n/locales")

    private fun catalogFor(locale: String): Map<String, String> {
        val file = File(localesDir, "$locale/panelLoading.json")
        assertTrue(file.isFile, "panelLoading.json is missing: ${file.path}")
        val root = json.parseToJsonElement(file.readText()) as JsonObject
        return buildMap { flatten(root, "", this) }
    }

    private fun flatten(obj: JsonObject, prefix: String, into: MutableMap<String, String>) {
        obj.forEach { (name, value) ->
            val path = if (prefix.isEmpty()) name else "$prefix.$name"
            when (value) {
                is JsonObject -> flatten(value, path, into)
                is JsonPrimitive -> value.contentOrNull()?.let { into[path] = it }
                else -> Unit
            }
        }
    }

    private fun JsonPrimitive.contentOrNull(): String? = if (isString) content else null

    private fun localeDirectories(): List<String> =
        localesDir.listFiles { f: File -> f.isDirectory }
            ?.map { it.name }
            ?.sorted()
            .orEmpty()

    @Test
    fun `english catalog holds exactly the keys Kotlin asks for`() {
        // Locked in both directions on purpose. Adding a string to the JSON without a
        // constant leaves it unreachable; adding a constant without the string ships a
        // screen that renders the raw key.
        assertEquals(keysUsedByKotlin, catalogFor("en").keys)
    }

    @Test
    fun `every locale translates every key`() {
        val locales = localeDirectories()
        assertTrue(locales.size >= 12, "Found no locale directories: $locales")

        val missing = locales.associateWith { locale ->
            keysUsedByKotlin - catalogFor(locale).keys
        }.filterValues { it.isNotEmpty() }

        assertTrue(missing.isEmpty(), "Some keys are left untranslated: $missing")
    }

    @Test
    fun `no locale left a string untranslated as the english original`() {
        val english = catalogFor("en")
        // Node.js is a product name and stays verbatim everywhere, so it is not evidence
        // that a locale was skipped.
        val translatableKeys = keysUsedByKotlin - LoadingPhase.LOCATING_NODE.key

        val untouched = (localeDirectories() - "en").associateWith { locale ->
            val catalog = catalogFor(locale)
            translatableKeys.filter { catalog[it] == english[it] }
        }.filterValues { it.isNotEmpty() }

        assertTrue(untouched.isEmpty(), "Some keys still hold the English original: $untouched")
    }

    @Test
    fun `phase keys and stuck hint keys do not collide`() {
        val phaseKeys = LoadingPhase.entries.map { it.key }
        assertEquals(phaseKeys.size, phaseKeys.toSet().size, "LoadingPhase keys are not unique")
        assertFalse(
            phaseKeys.any { it in setOf(StuckHintKeys.STILL_INDEXING, StuckHintKeys.INDEXING_DONE) },
            "A phase key collides with a stuck-hint key"
        )
    }
}
