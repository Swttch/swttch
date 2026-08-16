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
class HunkSelection {
    private val accepted = mutableSetOf<Int>()
    private val listeners = mutableListOf<() -> Unit>()

    /**
     * The changed regions as the IDE itself split them, learned when the diff
     * finishes comparing. The backend deliberately does not decide this: it
     * counted two changes where the IDE counted four on a real file, and a
     * checkbox can only mean something if it matches what is on screen.
     */
    private var ranges: List<AcceptedRange> = emptyList()

    /** Regions offered; 0 until the diff has been computed. */
    val total: Int get() = ranges.size

    /**
     * Adopt the IDE's split. Everything starts kept, so a reviewer who touches
     * nothing approves the whole change exactly as before.
     */
    fun setRanges(newRanges: List<AcceptedRange>) {
        ranges = newRanges
        accepted.clear()
        accepted.addAll(newRanges.indices)
        listeners.forEach { it() }
    }

    /** The regions currently kept, in file order, for the backend to assemble. */
    fun acceptedRanges(): List<AcceptedRange> =
        acceptedIndices().mapNotNull { ranges.getOrNull(it) }

    fun isAccepted(index: Int): Boolean = index in accepted

    fun toggle(index: Int) {
        if (index in accepted) accepted.remove(index) else accepted.add(index)
        listeners.forEach { it() }
    }

    fun setAll(value: Boolean) {
        accepted.clear()
        if (value) accepted.addAll(ranges.indices)
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
