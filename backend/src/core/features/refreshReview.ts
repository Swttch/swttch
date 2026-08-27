/**
 * Restate a pending review against the file as it is on disk now (#359).
 *
 * The reviewer's problem when the base moves is not that they must start over —
 * it is that the proposal in front of them describes a file that no longer
 * exists. So the proposal is recomputed from current content, and the review
 * carries on.
 *
 * What survives a refresh, and what cannot:
 *
 *  - Hunk decisions do NOT carry across. They address line numbers on a base
 *    that just changed, so re-applying them would point at moved lines. The
 *    surface resets them and the reviewer picks again against what is really
 *    there. Silently re-applying stale picks is exactly the class of bug this
 *    file exists to end.
 *  - A typed-over proposal cannot be carried either, for the same reason and
 *    more sharply: it is text written against lines that may no longer exist.
 *    It is handed back to the caller so the surface can keep showing it rather
 *    than discard the reviewer's work — deciding what to do with it is theirs.
 *
 * Re-deriving the proposal is what makes an approval afterwards safe: the tool
 * input the CLI receives is then stated against content that is actually on
 * disk, so `old_string` matches and a Write carries the current file.
 */
import { peekPreview, updatePreviewBase, type StoredPreview } from './diffPreview';
import { computeProposedContent } from './proposedEdit';
import { computeHunks } from './hunks';
import { readCurrentContent } from './reviewBase';

export type RefreshOutcome =
  /** Rebuilt: [preview] is stated against current disk and is safe to approve. */
  | { status: 'refreshed'; preview: StoredPreview }
  /** Already current — nothing moved since the review was built. */
  | { status: 'unchanged'; preview: StoredPreview }
  /**
   * The proposal cannot be restated against the current file. An Edit whose
   * `old_string` the user has since deleted is the ordinary case: there is no
   * honest diff to draw, and guessing one would be worse than saying so.
   */
  | { status: 'unrebuildable'; reason: 'no-longer-applies' | 'unreadable' }
  /** No such pending review — already answered, or never previewed. */
  | { status: 'unknown' };

/**
 * Rebuild the review for [toolUseId] from disk.
 *
 * Reads the file itself rather than taking content from the caller: the point
 * is to be stated against what is really there, and content that travelled
 * through a client is content that could be stale again by arrival.
 */
export async function refreshReviewAgainstDisk(toolUseId: string): Promise<RefreshOutcome> {
  const preview = peekPreview(toolUseId);
  if (!preview) return { status: 'unknown' };

  const current = await readCurrentContent(preview.filePath);

  // A Write creating a file that still does not exist has base '' and is
  // already current. Anything else that cannot be read has lost the ground the
  // proposal stood on.
  if (current === null) {
    if (preview.oldContent === '') return { status: 'unchanged', preview };
    return { status: 'unrebuildable', reason: 'unreadable' };
  }

  if (current === preview.oldContent) return { status: 'unchanged', preview };

  const proposed = computeProposedContent(preview.toolName, preview.input, current);
  if (proposed === null) return { status: 'unrebuildable', reason: 'no-longer-applies' };

  // A proposal that now matches the file is a no-op: whatever Claude wanted has
  // already arrived by another route. Treated as unrebuildable rather than
  // refreshed, because there is no change left to review or approve.
  if (proposed === current) return { status: 'unrebuildable', reason: 'no-longer-applies' };

  const hunks = computeHunks(current, proposed) ?? [];
  const updated = updatePreviewBase(toolUseId, {
    oldContent: current,
    newContent: proposed,
    hunks,
  });
  if (!updated) return { status: 'unknown' };

  return { status: 'refreshed', preview: updated };
}
