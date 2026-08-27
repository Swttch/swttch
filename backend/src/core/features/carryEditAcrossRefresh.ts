/**
 * Carry a reviewer's typing across a refreshed review on the IDE's diff (#359).
 *
 * The built-in surface does this in the webview, where the typing is already in
 * React state. The IDE's viewer has no equivalent: the reviewer's text lives in
 * a Swing document that only Kotlin can read, so it travels with the refresh
 * request and the merge happens here.
 *
 * Same merge either way — [mergeEdits] is shared — because a reviewer should not
 * lose different things depending on which diff they happened to be looking at.
 */
import { mergeEdits } from '../../shared/mergeEdits';

export interface CarriedEdit {
  /** The proposed side to redraw the review with. */
  newContent: string;
  /** 1-based lines where both sides changed, so the reviewer's text was dropped. */
  conflicts: number[];
}

/**
 * Merge [editedProposal] onto [rebuiltProposal].
 *
 * [proposalBeforeRefresh] is the base that says which side changed what: it is
 * the proposal the reviewer was typing over, read before the rebuild replaced
 * it.
 *
 * Returns [rebuiltProposal] untouched when there is nothing to carry — no
 * typing, or no base to judge it against. Absent arguments are the ordinary
 * case, not an error: most refreshes happen on a review nobody typed into.
 */
export function carryEditAcrossRefresh(
  proposalBeforeRefresh: string | undefined,
  editedProposal: string | undefined,
  rebuiltProposal: string,
): CarriedEdit {
  if (editedProposal === undefined || proposalBeforeRefresh === undefined) {
    return { newContent: rebuiltProposal, conflicts: [] };
  }
  const merged = mergeEdits(proposalBeforeRefresh, editedProposal, rebuiltProposal);
  return { newContent: merged.contents, conflicts: merged.conflicts };
}
