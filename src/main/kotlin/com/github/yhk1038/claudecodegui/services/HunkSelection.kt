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
     * Regions the reviewer has turned down, remembered as the regions
     * themselves rather than as positions among them.
     *
     * A re-diff renumbers everything: unticking the first of two hunks and then
     * typing in the proposed side produced three hunks, and index 0 no longer
     * named the region that had been declined. Holding the regions means a
     * decision survives a renumbering, and a region that the edit dissolved is
     * simply no longer among the ranges.
     */
    private val declined = mutableSetOf<AcceptedRange>()

    /**
     * Adopt the IDE's split, keeping decisions already made.
     *
     * Called again on every re-diff, which the IDE runs whenever the proposed
     * side is edited. Clearing the decisions here is what put a declined hunk
     * back under review the moment the reviewer typed anywhere else in the file
     * (#359) — so what is kept is everything the reviewer has not declined.
     */
    fun setRanges(newRanges: List<AcceptedRange>) {
        ranges = newRanges
        accepted.clear()
        newRanges.forEachIndexed { index, range ->
            if (range !in declined) accepted.add(index)
        }
        listeners.forEach { it() }
    }

    /** The regions currently kept, in file order, for the backend to assemble. */
    fun acceptedRanges(): List<AcceptedRange> =
        acceptedIndices().mapNotNull { ranges.getOrNull(it) }

    fun isAccepted(index: Int): Boolean = index in accepted

    fun toggle(index: Int) {
        val range = ranges.getOrNull(index)
        if (index in accepted) {
            accepted.remove(index)
            // Recorded by region, so the next re-diff can find the decision
            // again however it renumbers the hunks.
            range?.let { declined.add(it) }
        } else {
            accepted.add(index)
            range?.let { declined.remove(it) }
        }
        listeners.forEach { it() }
    }

    fun setAll(value: Boolean) {
        accepted.clear()
        declined.clear()
        if (value) accepted.addAll(ranges.indices) else declined.addAll(ranges)
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
