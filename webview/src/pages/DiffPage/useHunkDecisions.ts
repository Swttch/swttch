import { useCallback, useMemo, useState } from 'react';
import { hunkToAcceptedRange, type Hunk, type AcceptedRange } from '@/shared';

/**
 * What the reviewer has said about one hunk.
 *
 * `undefined` — not decided yet, so it is still on screen as a change.
 * `keep` — the proposal wins here; these lines get written.
 * `undo` — the file on disk wins here; the proposal is dropped.
 */
export type HunkDecision = 'keep' | 'undo';

export interface HunkDecisions {
  /** What was decided for [index], or undefined while it is still open. */
  decisionFor(index: number): HunkDecision | undefined;
  /** Write the proposal for this hunk. */
  keep(index: number): void;
  /** Drop the proposal for this hunk. */
  undo(index: number): void;
  /** Put this hunk back in play, as if it had never been answered. */
  reset(index: number): void;
  /** How many hunks are still waiting on the reviewer. */
  openCount: number;
  /** How many will be written. */
  keptCount: number;
  /** How many hunks there are in total. */
  total: number;
  /**
   * The regions to write, as the backend wants them.
   *
   * An undecided hunk counts as kept: the reviewer is reading a proposal, and
   * confirming without touching a hunk should apply it — that is what the
   * whole-file Confirm meant before any of this existed.
   */
  acceptedRanges: AcceptedRange[];
}

/**
 * Which parts of a proposal the reviewer is taking.
 *
 * Holds only the decisions. The diff on screen is derived from them by replaying
 * them onto the original — see useResolvedDiff — because a second copy of the
 * change is a second thing to keep in step, and `diffAcceptRejectHunk` leaves
 * its input untouched precisely so the original can stay the one source.
 *
 * That is also what makes Reset possible: nothing is destroyed when a hunk is
 * answered, so putting it back is just dropping its entry here.
 */
export function useHunkDecisions(hunks: readonly Hunk[]): HunkDecisions {
  const [decisions, setDecisions] = useState<ReadonlyMap<number, HunkDecision>>(
    () => new Map(),
  );

  const set = useCallback((index: number, decision: HunkDecision | undefined) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      if (decision === undefined) next.delete(index);
      else next.set(index, decision);
      return next;
    });
  }, []);

  const keep = useCallback((index: number) => set(index, 'keep'), [set]);
  const undo = useCallback((index: number) => set(index, 'undo'), [set]);
  const reset = useCallback((index: number) => set(index, undefined), [set]);

  const decisionFor = useCallback(
    (index: number) => decisions.get(index),
    [decisions],
  );

  const kept = useMemo(
    () => hunks.filter((h) => decisions.get(h.index) !== 'undo'),
    [hunks, decisions],
  );

  const openCount = useMemo(
    () => hunks.filter((h) => !decisions.has(h.index)).length,
    [hunks, decisions],
  );

  const acceptedRanges = useMemo(
    // Ascending and non-overlapping, which is what the backend requires to
    // rebuild the file. computeHunks already emits them in order.
    () => kept.map(hunkToAcceptedRange),
    [kept],
  );

  return {
    decisionFor,
    keep,
    undo,
    reset,
    openCount,
    keptCount: kept.length,
    total: hunks.length,
    acceptedRanges,
  };
}
