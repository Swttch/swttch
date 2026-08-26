import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorChange } from '@pierre/diffs';
import type { Hunk } from '@/shared';
import { mergeEdits } from './mergeEdits';

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

  /*
   * A proposal we were not seeded from means the review was rebuilt underneath
   * us — the file moved on disk and the change was restated against it (#359).
   *
   * The reviewer's typing is NOT discarded for that. A rebuild changes the
   * original side; typing lives on the proposed side. Unless the two landed on
   * the same line there is no reason to lose one to keep the other, and losing
   * it silently is what QA caught: an edit from `CLAUDE` to `CLAUDE22`
   * disappeared on Refresh with nothing said about it.
   *
   * Merged during render rather than in an effect, so the screen never shows a
   * frame with the typing missing before it comes back.
   */
  const merged = useMemo(
    () =>
      edits.seededFrom === proposal
        ? null
        : mergeEdits(edits.seededFrom, edits.contents, proposal),
    [edits.seededFrom, edits.contents, proposal],
  );

  const contents = merged ? merged.contents : edits.contents;

  /*
   * Settle the merge into state once the render that computed it has landed.
   *
   * Without this, `edits` still names the OLD proposal, so the next keystroke
   * would merge against a base two rebuilds behind. Written in an effect rather
   * than during render because it is a state write, and it is a no-op whenever
   * nothing was rebuilt.
   */
  useEffect(() => {
    if (!merged) return;
    setEdits({ seededFrom: proposal, contents: merged.contents });
  }, [merged, proposal]);

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

  /*
   * Put one hunk's lines back to what Claude proposed, and forget it was typed
   * into.
   *
   * The text half used to be left to the caller — the comment here said so, and
   * no caller ever did it, so Reset dropped a flag and changed nothing anyone
   * could see. It belongs here regardless: this is what holds the text and the
   * proposal it came from, and a caller doing it would need both.
   *
   * Only the hunk's own lines are restored. Everything typed elsewhere in the
   * file stays, which is the difference between resetting a hunk and abandoning
   * the review.
   */
  const resetHunk = useCallback(
    (hunkIndex: number) => {
      setEditedHunks((prev) => {
        if (!prev.has(hunkIndex)) return prev;
        const next = new Set(prev);
        next.delete(hunkIndex);
        return next;
      });

      const hunk = hunks.find((h) => h.index === hunkIndex);
      if (hunk === undefined) return;

      setEdits((prev) => {
        const current = prev.seededFrom === proposal ? prev.contents : proposal;
        const restored = restoreHunkLines(current, proposal, hunk);
        if (restored === null || restored === current) return prev;
        return { seededFrom: proposal, contents: restored };
      });
    },
    [hunks, proposal],
  );

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

/**
 * [current] with the lines [hunk] covers put back to what [proposal] has there,
 * or null when that cannot be done safely.
 *
 * A hunk's span is stated in PROPOSAL line numbers, so it only addresses the
 * same lines in `current` while the two have the same number of them. An edit
 * that added or removed a line moves every hunk after it, and restoring by
 * those stale coordinates would overwrite whatever the reviewer typed at the
 * shifted position — worse than leaving Reset unable to act, which is what null
 * means here.
 */
function restoreHunkLines(current: string, proposal: string, hunk: Hunk): string | null {
  const currentLines = current.split('\n');
  const proposalLines = proposal.split('\n');
  if (currentLines.length !== proposalLines.length) return null;

  // The hunk counts from one; the array counts from zero.
  const start = hunk.newStart - 1;
  const end = start + hunk.newLines;
  if (start < 0 || end > proposalLines.length) return null;

  const restored = [...currentLines];
  for (let i = start; i < end; i++) restored[i] = proposalLines[i];
  return restored.join('\n');
}
