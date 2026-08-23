import type { FileDiffMetadata } from '@pierre/diffs';
import type { AcceptedRange } from '@/shared';

/**
 * One run of changed lines as the RENDERER draws it.
 *
 * Deliberately not the backend's `Hunk`. The two split a change differently:
 * `computeHunks` groups by three lines of surrounding context the way
 * `git diff` does, so two edits a few lines apart land in one hunk — while the
 * renderer draws them as two separate blocks. Attaching controls to the
 * backend's units left visible changes with no buttons on them at all.
 *
 * Controls follow what is on screen, and the decision is converted to line
 * ranges before it leaves — which is what `applyAcceptedRanges` takes, and why
 * it takes ranges rather than hunk numbers.
 */
export interface ChangeBlock {
  /** Stable identity for this block within the file. */
  index: number;
  /** First proposed line of the block, 1-based. */
  newStart: number;
  /** How many proposed lines it spans. */
  newLines: number;
  /** First original line it replaces, 1-based. */
  oldStart: number;
  /** How many original lines it replaces. */
  oldLines: number;
}

/** The shape this module reads out of FileDiffMetadata. */
interface RawHunk {
  hunkContent?: {
    type: string;
    additions: number;
    additionLineIndex: number;
    deletions: number;
    deletionLineIndex: number;
  }[];
}

/**
 * Every change block in [diff], in file order.
 *
 * Reads `hunkContent`, whose `change` entries are exactly what gets drawn as
 * changed. A block that only deletes has `additions === 0`; it still counts,
 * because refusing it is a decision.
 */
export function changeBlocksOf(diff: FileDiffMetadata): ChangeBlock[] {
  const hunks = (diff as unknown as { hunks: RawHunk[] }).hunks ?? [];
  const blocks: ChangeBlock[] = [];

  for (const hunk of hunks) {
    for (const content of hunk.hunkContent ?? []) {
      if (content.type !== 'change') continue;
      blocks.push({
        index: blocks.length,
        // The library counts from zero; every other line number in this app,
        // and every range the backend takes, counts from one.
        newStart: content.additionLineIndex + 1,
        newLines: content.additions,
        oldStart: content.deletionLineIndex + 1,
        oldLines: content.deletions,
      });
    }
  }

  return blocks;
}

/**
 * The region [block] covers, as the backend wants it.
 *
 * Same conversion the backend's own hunks go through: 1-based start plus a
 * length becomes a 0-based half-open range.
 */
export function blockToAcceptedRange(block: ChangeBlock): AcceptedRange {
  return {
    oldStart: block.oldStart - 1,
    oldEnd: block.oldStart - 1 + block.oldLines,
    newStart: block.newStart - 1,
    newEnd: block.newStart - 1 + block.newLines,
  };
}

/** The last proposed line [block] changes, for anchoring its controls. */
export function blockAnchorLine(block: ChangeBlock): number {
  // A block that only deletes has no proposed line of its own; anchor where
  // those lines were removed from.
  if (block.newLines === 0) return block.newStart;
  return block.newStart + block.newLines - 1;
}
