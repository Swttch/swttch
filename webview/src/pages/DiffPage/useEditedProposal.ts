import { useCallback, useState } from 'react';
import type { EditorChange } from '@pierre/diffs';
import type { Hunk } from '@/shared';

export interface EditedProposal {
  /**
   * The proposed side as it stands, including anything the reviewer typed.
   *
   * This is what the diff on screen is built from — NOT the untouched proposal.
   * Rebuilding from the proposal is what lost edits: resolving any hunk
   * recomputed the whole diff, and every edit went with it.
   */
  contents: string;
  /** Whether the reviewer has typed anything at all. */
  isEdited: boolean;
  /** Whether [hunkIndex] specifically has been typed into. */
  isHunkEdited(hunkIndex: number): boolean;
  /** Record an edit reported by the editor. */
  applyEdit(contents: string, changes: readonly EditorChange[]): void;
  /** Throw away every edit inside [hunkIndex], keeping the rest. */
  resetHunk(hunkIndex: number): void;
}

/**
 * The proposed side of the review, as the reviewer has it now.
 *
 * Two things are tracked, and they answer different questions:
 *
 *  - `contents` is the text. The diff is rendered from this, so an edit
 *    survives resolving a hunk somewhere else in the file.
 *  - `editedHunks` is which hunks were typed into, so each one can offer Reset
 *    only when there is something to reset.
 *
 * The editor reports the second for us: every change event carries the line
 * range it replaced, so a change overlapping a hunk's lines marks that hunk.
 * Nothing is re-diffed to work it out.
 */
export function useEditedProposal(proposal: string, hunks: readonly Hunk[]): EditedProposal {
  /*
   * Seeded from the proposal, and re-seeded when a different one arrives.
   *
   * `useState(proposal)` alone reads its argument on the first render only. The
   * page renders once before the change has been fetched, so that first value
   * is the empty string — and the diff then renders the whole file as deleted
   * against nothing, for the rest of the session.
   *
   * Tracking the proposal it was seeded from is what makes "a different one
   * arrived" answerable without an effect, which would paint the empty state
   * first and correct it a frame later.
   */
  const [edits, setEdits] = useState<{ seededFrom: string; contents: string }>(() => ({
    seededFrom: proposal,
    contents: proposal,
  }));
  const [editedHunks, setEditedHunks] = useState<ReadonlySet<number>>(() => new Set());

  // A proposal we were not seeded from is a new review in the same component:
  // its own text wins, and the edits recorded against the previous one are moot.
  const contents = edits.seededFrom === proposal ? edits.contents : proposal;

  const applyEdit = useCallback(
    (next: string, changes: readonly EditorChange[]) => {
      // Stamped with the proposal this edit belongs to, so the re-seed check
      // above keeps holding afterwards rather than discarding it.
      setEdits({ seededFrom: proposal, contents: next });
      setEditedHunks((prev) => {
        const touched = new Set(prev);
        for (const change of changes) {
          for (const hunk of hunks) {
            if (overlapsHunk(change, hunk)) touched.add(hunk.index);
          }
        }
        return touched;
      });
    },
    [hunks, proposal],
  );

  const resetHunk = useCallback((hunkIndex: number) => {
    setEditedHunks((prev) => {
      if (!prev.has(hunkIndex)) return prev;
      const next = new Set(prev);
      next.delete(hunkIndex);
      return next;
    });
    // The text itself is restored by the caller, which owns the proposal this
    // hunk should go back to — see DiffPage.
  }, []);

  const isHunkEdited = useCallback((hunkIndex: number) => editedHunks.has(hunkIndex), [editedHunks]);

  return {
    contents,
    /*
     * Compared against the text, not counted from `editedHunks`.
     *
     * A change the backend could not split has no hunks at all, so a per-hunk
     * count is zero however much was typed — and the edit was dropped on the
     * way to the backend. The text answers this for every review.
     */
    isEdited: contents !== proposal,
    isHunkEdited,
    applyEdit,
    resetHunk,
  };
}

/**
 * Whether [change] touched any line of [hunk].
 *
 * The editor counts lines from zero and the hunk counts from one, and a hunk's
 * span is a start plus a length rather than an end — so this is the one place
 * those three differences are reconciled.
 */
function overlapsHunk(change: EditorChange, hunk: Hunk): boolean {
  const changeStart = change.range.start.line;
  const changeEnd = change.range.end.line;
  const hunkStart = hunk.newStart - 1;
  const hunkEnd = hunkStart + hunk.newLines - 1;
  return changeStart <= hunkEnd && changeEnd >= hunkStart;
}
