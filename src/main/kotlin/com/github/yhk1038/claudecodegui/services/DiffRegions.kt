package com.github.yhk1038.claudecodegui.services

import com.intellij.diff.comparison.ComparisonManager
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.comparison.DiffTooBigException
import com.intellij.diff.fragments.LineFragment
import com.intellij.openapi.progress.DumbProgressIndicator
import com.intellij.openapi.progress.ProcessCanceledException

/**
 * The changed regions of a proposed edit, worked out from the two texts alone.
 *
 * The diff viewer learns its regions only after it has compared, and only some
 * viewers report them at all (#620). A review that waited for the viewer had no
 * regions when the one-line viewer was chosen, when a button was pressed before
 * the comparison finished, or when reading the viewer failed — and every one of
 * those read as "kept nothing". Asking the IDE's own comparison directly makes
 * the regions known from the moment the review opens, whatever the viewer does.
 *
 * The viewer, when it can report, still replaces these with its own split (see
 * [HunkGutterExtension]): that is the split the tick boxes sit beside.
 */
object DiffRegions {
    /**
     * The regions, or null when the two texts could not be compared at all.
     *
     * Null is not "nothing changed". An empty list means the comparison ran and
     * found no difference; null means we do not know, and the review must say so
     * instead of guessing.
     */
    fun regionsOf(oldContent: String, newContent: String): List<AcceptedRange>? =
        regionsFrom(oldContent, newContent) { old, new ->
            ComparisonManager.getInstance().compareLines(old, new, ComparisonPolicy.DEFAULT, DumbProgressIndicator.INSTANCE)
        }

    /** [compare] is a parameter so the failure path can be exercised without a running IDE. */
    internal fun regionsFrom(
        oldContent: String,
        newContent: String,
        compare: (String, String) -> List<LineFragment>,
    ): List<AcceptedRange>? {
        val fragments = try {
            compare(oldContent, newContent)
        } catch (e: DiffTooBigException) {
            // Checked first: the IDE makes this a kind of cancellation, which the
            // next clause would otherwise pass on instead of answering "unknown".
            return null
        } catch (e: ProcessCanceledException) {
            // Not ours to swallow: the IDE is cancelling the work on purpose.
            throw e
        } catch (e: Exception) {
            // Too large to compare (DiffTooBigException), or the comparison failed
            // for any other reason: either way the regions are not known, and the
            // review says so instead of failing to open.
            return null
        }
        return fragments.map { fragment ->
            AcceptedRange(
                oldStart = fragment.startLine1,
                oldEnd = fragment.endLine1,
                newStart = fragment.startLine2,
                newEnd = fragment.endLine2,
            )
        }
    }
}
