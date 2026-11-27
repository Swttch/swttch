package com.github.yhk1038.claudecodegui.services

import java.util.concurrent.ConcurrentHashMap

/**
 * What the panels registered with a backend, by panel id.
 *
 * A panel id is the editor tab's id, and a split editor tab shows one tab in two panels (#48), so an
 * id can hold several registrations at once. [release] takes back the value that was registered, so
 * closing one view leaves the other views registered (#753).
 */
class PanelRegistry<T : Any> {
    // Each list is replaced rather than mutated, so a reader never sees a half-changed one.
    private val byPanel = ConcurrentHashMap<String, List<T>>()

    fun register(panelId: String, value: T) {
        byPanel.compute(panelId) { _, held -> held.orEmpty().filter { it !== value } + value }
    }

    fun release(panelId: String, value: T) {
        // Returning null drops the panel id once nothing is left under it.
        byPanel.computeIfPresent(panelId) { _, held -> held.filter { it !== value }.takeIf { it.isNotEmpty() } }
    }

    /** The latest registration still held for [panelId]. */
    operator fun get(panelId: String): T? = byPanel[panelId]?.lastOrNull()

    /** One registration of any panel, for work that is not about a particular one. */
    fun any(): T? = byPanel.values.firstOrNull()?.lastOrNull()

    /** Every registration of every panel. */
    fun all(): List<T> = byPanel.values.flatten()

    /** How many panel ids are registered; a split tab counts once. */
    val size: Int get() = byPanel.size

    fun isNotEmpty(): Boolean = byPanel.isNotEmpty()
}
