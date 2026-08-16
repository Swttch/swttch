package com.github.yhk1038.claudecodegui.services

import com.intellij.openapi.util.Key

/**
 * Which hunks of a proposed edit the reviewer is keeping, shared between the
 * checkboxes drawn in the diff gutter and the Apply button under it (#109).
 *
 * Attached to the diff request so both find the same instance: the gutter marks
 * live on the editor, the buttons live on a panel beside it, and a copy in
 * either place would let the two disagree about what Apply is about to do.
 */
class HunkSelection(hunkCount: Int) {
    private val accepted = (0 until hunkCount).toMutableSet()
    private val listeners = mutableListOf<() -> Unit>()

    /** Total hunks offered; 0 when the change was too large to split. */
    val total: Int = hunkCount

    fun isAccepted(index: Int): Boolean = index in accepted

    fun toggle(index: Int) {
        if (index in accepted) accepted.remove(index) else accepted.add(index)
        listeners.forEach { it() }
    }

    fun setAll(value: Boolean) {
        accepted.clear()
        if (value) accepted.addAll(0 until total)
        listeners.forEach { it() }
    }

    /** Sorted so the backend's log and any test read in hunk order. */
    fun acceptedIndices(): List<Int> = accepted.sorted()

    fun keptCount(): Int = accepted.size

    /** Notified whenever the selection changes, so the buttons can re-label. */
    fun onChange(listener: () -> Unit) {
        listeners.add(listener)
    }

    /**
     * Gutter marks currently drawn for this selection, with how to remove each.
     *
     * Held here rather than in the extension: a re-diff redraws the marks, and
     * without dropping the previous round first every pass would leave another
     * stale tick box behind. Tied to the selection's lifetime, so nothing
     * outlives the review it belongs to.
     */
    private val marks = mutableListOf<Pair<Any, (Any) -> Unit>>()

    fun rememberMark(mark: Any, remove: (Any) -> Unit) {
        marks.add(mark to remove)
    }

    fun disposeMarks() {
        marks.forEach { (mark, remove) -> runCatching { remove(mark) } }
        marks.clear()
    }

    companion object {
        val KEY: Key<HunkSelection> = Key.create("ccg.hunkSelection")
    }
}
