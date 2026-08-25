import { useMemo } from 'react';
import { diffAcceptRejectHunk, type FileDiffMetadata } from '@pierre/diffs';
import type { HunkDecisions } from './useHunkDecisions';

/** The shape this module reads out of FileDiffMetadata. See changeBlocks. */
interface RawHunk {
  hunkContent?: { type: string }[];
}

/**
 * The diff as it should look right now, given what the reviewer has answered.
 *
 * An answered block stops being drawn as a change: keeping it collapses to the
 * proposed lines, undoing it collapses to the lines on disk. Either way it
 * becomes context, so what is left on screen is exactly what is left to decide.
 *
 * Resolved by the library rather than by hand. A `change` entry carries only
 * COORDINATES — `{additions, deletions, additionLineIndex, deletionLineIndex}` —
 * and the text lives in the diff's top-level `additionLines`/`deletionLines`.
 * Retyping the entry to `context` therefore changes nothing anyone draws: the
 * renderer keeps painting a deletion beside an addition, and the reviewer sees
 * a hunk they have already answered sitting exactly where it was.
 * `diffAcceptRejectHunk` rewrites those line arrays too, which is what actually
 * takes the block off the screen.
 *
 * Applied high index first. Resolving a hunk renumbers the ones after it, so
 * walking forwards would apply each later decision to a hunk that had shifted
 * out from under its index.
 *
 * Recomputed from [original] on every change rather than accumulated, which is
 * what makes Reset work: `diffAcceptRejectHunk` does not touch its input, so the
 * untouched original is always available to replay a different set of answers
 * onto. Accumulating instead would destroy the block on the first answer and
 * leave nothing to go back to.
 */
export function useResolvedDiff(
  original: FileDiffMetadata,
  // Optional because a change the backend could not split has no per-block
  // decisions to replay; that review is whole-file and the diff is the original.
  decisions?: HunkDecisions,
): FileDiffMetadata {
  const decisionFor = decisions?.decisionFor;

  return useMemo(() => {
    if (!decisionFor) return original;

    // The library resolves a whole HUNK; this page decides per change BLOCK,
    // and a hunk holds every block within three lines of the last. So a hunk is
    // only resolvable once its blocks agree — see hunkVerdicts.
    const verdicts = hunkVerdicts(original, decisionFor);

    let diff = original;
    for (let hunk = verdicts.length - 1; hunk >= 0; hunk--) {
      const verdict = verdicts[hunk];
      if (!verdict) continue;
      // keep → the proposal wins here; undo → the file on disk wins.
      diff = diffAcceptRejectHunk(diff, hunk, verdict === 'keep' ? 'accept' : 'reject');
    }
    return diff;
  }, [original, decisionFor]);
}

/**
 * What each hunk of [diff] should become, or undefined to leave it alone.
 *
 * A hunk resolves only when every block inside it got the SAME answer. Mixed —
 * one kept, one undone, or one still open — leaves it drawn, because the
 * library resolves hunks whole and there is no way to say "this half of it".
 * Leaving it is the honest outcome: the blocks that are settled keep their
 * controls in the Reset/Back state, and what still needs an answer stays on
 * screen. The ranges sent to the backend are built from the decisions
 * themselves, so a hunk left drawn here still writes exactly what was chosen.
 *
 * Blocks are walked in the same order `changeBlocksOf` numbers them — both read
 * `hunkContent` in file order — so the counter here IS that block's index.
 */
function hunkVerdicts(
  diff: FileDiffMetadata,
  decisionFor: (index: number) => 'keep' | 'undo' | undefined,
): (('keep' | 'undo') | undefined)[] {
  const hunks = (diff as unknown as { hunks?: RawHunk[] }).hunks ?? [];
  let block = 0;

  return hunks.map((hunk) => {
    let verdict: 'keep' | 'undo' | undefined;
    let first = true;
    let mixed = false;

    for (const entry of hunk.hunkContent ?? []) {
      if (entry.type !== 'change') continue;
      const decision = decisionFor(block++);
      if (first) {
        verdict = decision;
        first = false;
      } else if (decision !== verdict) {
        mixed = true;
      }
    }

    return mixed ? undefined : verdict;
  });
}
