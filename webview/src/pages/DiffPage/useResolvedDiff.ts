import { useMemo } from 'react';
import { diffAcceptRejectHunk, type FileDiffMetadata } from '@pierre/diffs';
import type { HunkDecisions } from './useHunkDecisions';

/**
 * The diff as it should look right now, given what the reviewer has answered.
 *
 * An answered hunk stops being drawn as a change: keeping it collapses to the
 * proposed lines, undoing it collapses to the lines on disk. Either way it
 * becomes context, so what is left on screen is exactly what is left to decide.
 *
 * Recomputed from [original] on every change rather than accumulated, which is
 * what makes Reset work: `diffAcceptRejectHunk` does not touch its input, so the
 * untouched original is always available to replay a different set of answers
 * onto. Accumulating instead would destroy the hunk on the first answer and
 * leave nothing to go back to.
 *
 * Applied high index first. Resolving a hunk renumbers the ones after it, so
 * walking forwards would apply each later decision to a hunk that had shifted
 * out from under its index.
 */
export function useResolvedDiff(
  original: FileDiffMetadata,
  // Optional because a change the backend could not split has no per-hunk
  // decisions to replay; that review is whole-file and the diff is the original.
  decisions?: HunkDecisions,
): FileDiffMetadata {
  const decisionFor = decisions?.decisionFor;
  const total = decisions?.total ?? 0;

  return useMemo(() => {
    if (!decisionFor) return original;
    let diff = original;
    for (let index = total - 1; index >= 0; index--) {
      const decision = decisionFor(index);
      if (!decision) continue;
      // keep → the proposal wins here; undo → the file on disk wins.
      diff = diffAcceptRejectHunk(diff, index, decision === 'keep' ? 'accept' : 'reject');
    }
    return diff;
  }, [original, decisionFor, total]);
}
