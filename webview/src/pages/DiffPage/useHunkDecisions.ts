import { useCallback, useMemo, useState } from 'react';
import type { AcceptedRange } from '@/shared';
import { blockToAcceptedRange, type ChangeBlock } from './changeBlocks';

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
  /** Accept every hunk at once. */
  acceptAll(): void;
  /** Put every hunk back in play, as if none had been answered. */
  resetAll(): void;
  /** Whether every hunk has been accepted. */
  allAccepted: boolean;
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
export function useHunkDecisions(hunks: readonly ChangeBlock[]): HunkDecisions {
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

  const acceptAll = useCallback(() => {
    setDecisions(new Map(hunks.map((h) => [h.index, 'keep' as const])));
  }, [hunks]);

  // Back to undecided rather than to denied: clearing a selection should not
  // itself be a decision, and nothing typed is lost this way.
  const resetAll = useCallback(() => setDecisions(new Map()), []);

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
    () => kept.map(blockToAcceptedRange),
    [kept],
  );

  /*
   * Memoized, because consumers key render decisions off this object.
   *
   * A literal here is a new object on every render, and the review diff passes
   * values derived from it to a renderer that compares by identity and rebuilds
   * on change — taking the reviewer's edit session down with it every time.
   * Nothing here is cheap to rebuild, but identity is what actually matters.
   */
  return useMemo(
    () => ({
      decisionFor,
      keep,
      undo,
      reset,
      acceptAll,
      resetAll,
      allAccepted: hunks.length > 0 && hunks.every((h) => decisions.get(h.index) === 'keep'),
      openCount,
      keptCount: kept.length,
      total: hunks.length,
      acceptedRanges,
    }),
    [decisionFor, keep, undo, reset, acceptAll, resetAll, hunks, decisions, openCount, kept.length, acceptedRanges],
  );
}
