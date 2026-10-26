package com.github.yhk1038.claudecodegui.startup

import java.net.URLDecoder
import java.net.URLEncoder

/**
 * The chat tabs a project had open when this plugin was unloaded, in the order
 * they should be reopened (issue #598).
 *
 * It is written as one string because the only place that outlives the unload is
 * the platform's own project properties: our services, and every class that could
 * decode a richer format, are gone the moment the plugin unloads. The tab fields
 * are URL-encoded so a title containing the separator characters cannot split a
 * record.
 */
internal data class ReloadedTab(
    val tabId: String,
    val path: String?,
    val title: String?,
    /** 0 for the first editor pane, 1 for any pane after it. A split is restored as one more pane. */
    val pane: Int = 0,
)

internal object ReloadedTabsSnapshot {

    private const val RECORD_SEPARATOR = "\n"
    private const val FIELD_SEPARATOR = "\t"

    /**
     * Which of the recorded tabs were really open when the plugin unloaded.
     *
     * The persisted list can name tabs that are no longer open, since a killed IDE
     * never got to remove them, and reopening those would bring back chats the
     * user had closed. In editor-tab mode the open editors are the truth, and
     * intersecting with the recorded list also leaves out diff tabs, which are
     * editors too but are deliberately never recorded. Tool-window tabs are not
     * editors, so there the recorded list is all there is.
     */
    fun selectOpenTabs(recordedOrder: List<String>, openEditorTabIds: Set<String>, editorTabMode: Boolean): List<String> =
        if (editorTabMode) recordedOrder.filter { it in openEditorTabIds } else recordedOrder

    /**
     * The tabs that must move to the second pane to match where they were. Tabs
     * that were in the first pane are left alone because the IDE opens new tabs there.
     */
    fun tabsForSecondPane(wanted: List<ReloadedTab>): List<String> =
        wanted.filter { it.pane == 1 }.map { it.tabId }

    /**
     * Collapse the pane a tab was found in to 0 (first) or 1 (any later pane).
     * Restoring one extra side-by-side pane keeps tabs that were together
     * together; deeper or vertical layouts are not reproduced.
     */
    fun paneOf(windowIndex: Int): Int = if (windowIndex <= 0) 0 else 1

    fun encode(tabs: List<ReloadedTab>): String =
        tabs.joinToString(RECORD_SEPARATOR) { tab ->
            listOf(tab.tabId, tab.path.orEmpty(), tab.title.orEmpty(), tab.pane.toString())
                .joinToString(FIELD_SEPARATOR) { URLEncoder.encode(it, Charsets.UTF_8) }
        }

    fun decode(encoded: String?): List<ReloadedTab> {
        if (encoded.isNullOrEmpty()) return emptyList()
        return encoded.split(RECORD_SEPARATOR).mapNotNull { record ->
            val fields = record.split(FIELD_SEPARATOR).map { URLDecoder.decode(it, Charsets.UTF_8) }
            val tabId = fields.getOrNull(0)?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            ReloadedTab(
                tabId = tabId,
                path = fields.getOrNull(1)?.takeIf { it.isNotEmpty() },
                title = fields.getOrNull(2)?.takeIf { it.isNotEmpty() },
                pane = fields.getOrNull(3)?.toIntOrNull()?.coerceIn(0, 1) ?: 0,
            )
        }
    }
}
