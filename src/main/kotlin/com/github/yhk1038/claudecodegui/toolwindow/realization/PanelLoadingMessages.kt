package com.github.yhk1038.claudecodegui.toolwindow.realization

import com.github.yhk1038.claudecodegui.settings.SettingsManager
import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Translations for the placeholder shown while the JCEF browser is not yet realized.
 *
 * The placeholder is a Swing label that exists precisely because the webview is not up
 * yet, so it cannot use the webview's i18n. The catalogs here are the very same locale
 * files the webview uses (`webview/src/i18n/locales/<locale>/panelLoading.json`), copied
 * into plugin resources by the `syncPanelLoadingMessages` Gradle task. Translators keep
 * editing one place; nothing is transcribed by hand.
 *
 * The copy task names each file after the `uiLanguage` SETTING VALUE (`korean.json`,
 * `chinese.json`) rather than the locale code, so this object needs no copy of the
 * `LANGUAGE_TO_LOCALE` table — the value read from settings.js IS the file name.
 */
object PanelLoadingMessages {

    /** `uiLanguage` is null by default, and null means English (see languageMap.ts). */
    private const val FALLBACK_LANGUAGE = "english"

    private const val RESOURCE_DIR = "/messages/panel-loading"

    private val logger = Logger.getInstance(PanelLoadingMessages::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val lock = Any()

    /** Catalog for the user's Interface Language. Null until [preload] succeeds. */
    @Volatile
    private var primary: Map<String, String>? = null

    /** English catalog, used for keys the primary catalog is missing. */
    @Volatile
    private var english: Map<String, String>? = null

    /**
     * Resolves the user's Interface Language and caches its catalog.
     *
     * **Must not run on the EDT.** Reading `uiLanguage` goes through [SettingsManager],
     * which stats and may re-read `~/.claude-code-gui/settings.js` on disk. A slow home
     * directory would then freeze the UI thread on the very screen this label is trying
     * to keep responsive.
     *
     * Safe to call repeatedly; the first successful call wins.
     */
    fun preload() {
        if (primary != null) return
        val language = readUiLanguage() ?: FALLBACK_LANGUAGE
        val loaded = loadCatalog(language) ?: loadCatalog(FALLBACK_LANGUAGE)
        synchronized(lock) {
            if (primary == null && loaded != null) primary = loaded
        }
    }

    /**
     * Looks up a translated string. Reads caches only, so this is safe on the EDT.
     *
     * Falls back to English for a key the translated catalog lacks, and to the key itself
     * when even the English catalog is unavailable. Returning the key is deliberate: an
     * absent catalog means the plugin was packaged without its resources, and a visible
     * `phase.indexingWait` reports that far better than a silently blank screen. The
     * `syncPanelLoadingMessages` task fails the build before that can ship.
     */
    fun get(key: String): String {
        primary?.get(key)?.let { return it }
        return englishCatalog()?.get(key) ?: key
    }

    private fun englishCatalog(): Map<String, String>? {
        english?.let { return it }
        // Classpath-only read (the plugin jar the IDE already has open), so unlike
        // preload() this stays cheap enough to happen lazily.
        val loaded = loadCatalog(FALLBACK_LANGUAGE) ?: return null
        synchronized(lock) {
            if (english == null) english = loaded
        }
        return english
    }

    private fun readUiLanguage(): String? = try {
        (SettingsManager.getInstance().get("uiLanguage") as? JsonPrimitive)?.contentOrNull
    } catch (e: Exception) {
        // No application service in a headless/test context, or the settings file is
        // unreadable. English is the documented default, so this is not an error.
        logger.debug("Could not read uiLanguage; falling back to $FALLBACK_LANGUAGE", e)
        null
    }

    private fun loadCatalog(language: String): Map<String, String>? {
        val stream = javaClass.getResourceAsStream("$RESOURCE_DIR/$language.json") ?: return null
        return try {
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            val root = json.parseToJsonElement(text) as? JsonObject ?: return null
            buildMap { flatten(root, "", this) }
        } catch (e: Exception) {
            logger.warn("Could not read the panel loading catalog for '$language'", e)
            null
        }
    }

    /** Flattens `{"phase":{"backendStart":"..."}}` into `phase.backendStart`. */
    private fun flatten(obj: JsonObject, prefix: String, into: MutableMap<String, String>) {
        obj.forEach { (name, value) ->
            val path = if (prefix.isEmpty()) name else "$prefix.$name"
            when (value) {
                is JsonObject -> flatten(value, path, into)
                is JsonPrimitive -> value.contentOrNull?.let { into[path] = it }
                else -> Unit
            }
        }
    }
}
