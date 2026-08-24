/**
 * Replaying the reviewer's answers onto the original diff.
 *
 * The property everything here turns on: this page counts CHANGE BLOCKS, and a
 * hunk may hold several of them. `changeBlocksOf` numbers the blocks, the
 * controls carry those numbers, the decisions are stored under them, and the
 * ranges sent to the backend are built from them — so the resolved diff has to
 * be indexed the same way. It was not, and answering a block the library had no
 * matching hunk for threw `Invalid hunk index`.
 *
 * Two edits a few lines apart are the case that separates the two numberings,
 * so that is what most of this file is built on.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { parseDiffFromFile, type FileDiffMetadata } from '@pierre/diffs';
import { useResolvedDiff } from '../useResolvedDiff';
import { changeBlocksOf } from '../changeBlocks';
import type { HunkDecision, HunkDecisions } from '../useHunkDecisions';

const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

/** Two edits three lines apart: git-style grouping puts both in ONE hunk. */
const near = before.replace('line 5', 'FIVE').replace('line 7', 'SEVEN');

/** Two edits far apart: one hunk each. */
const far = before.replace('line 5', 'FIVE').replace('line 16', 'SIXTEEN');

function makeDiff(after: string): FileDiffMetadata {
  return parseDiffFromFile(
    { name: 'f.txt', contents: before },
    { name: 'f.txt', contents: after },
  );
}

function hunkCount(diff: FileDiffMetadata): number {
  return (diff as unknown as { hunks: unknown[] }).hunks.length;
}

/** The addition/deletion text the renderer actually paints, as one string. */
export function painted(diff: FileDiffMetadata): string {
  const d = diff as unknown as { additionLines: string[]; deletionLines: string[] };
  return JSON.stringify([d.additionLines, d.deletionLines]);
}

/** How many blocks are still drawn as changes, i.e. still awaiting an answer. */
function openBlocks(diff: FileDiffMetadata): number {
  const hunks = (diff as unknown as { hunks: { hunkContent?: { type: string }[] }[] }).hunks;
  return hunks.reduce(
    (n, h) => n + (h.hunkContent ?? []).filter((c) => c.type === 'change').length,
    0,
  );
}

/** A decisions object holding exactly [answers], keyed by block number. */
function decisionsOf(
  diff: FileDiffMetadata,
  answers: ReadonlyMap<number, HunkDecision>,
): HunkDecisions {
  const total = changeBlocksOf(diff).length;
  return {
    decisionFor: (index: number) => answers.get(index),
    keep: () => {},
    undo: () => {},
    reset: () => {},
    acceptAll: () => {},
    resetAll: () => {},
    allAccepted: answers.size === total,
    openCount: total - answers.size,
    keptCount: total,
    total,
    acceptedRanges: [],
  };
}

function resolve(diff: FileDiffMetadata, answers: ReadonlyMap<number, HunkDecision>) {
  return renderHook(() => useResolvedDiff(diff, decisionsOf(diff, answers))).result.current;
}

/** Every block answered `keep`, which is what Select all does. */
function acceptAll(diff: FileDiffMetadata): ReadonlyMap<number, HunkDecision> {
  return new Map(changeBlocksOf(diff).map((b) => [b.index, 'keep' as const]));
}

describe('the two numberings this page has to keep straight', () => {
  it('puts two nearby edits in one hunk but two blocks', () => {
    // The premise of the bug, and of most of this file. If grouping ever changes
    // so that these are two hunks, the regression tests below stop covering
    // anything and need a closer pair of edits.
    const diff = makeDiff(near);
    expect(hunkCount(diff)).toBe(1);
    expect(changeBlocksOf(diff)).toHaveLength(2);
  });

  it('puts two distant edits in one hunk each', () => {
    const diff = makeDiff(far);
    expect(hunkCount(diff)).toBe(2);
    expect(changeBlocksOf(diff)).toHaveLength(2);
  });
});

describe('useResolvedDiff', () => {
  it('settles every block when Select all answers more blocks than there are hunks', () => {
    // The reported crash: two blocks, one hunk. Answering block 1 used to be
    // read as hunk 1, which does not exist — `Invalid hunk index`, and the whole
    // review went to the error boundary.
    const diff = makeDiff(near);
    expect(openBlocks(diff)).toBe(2);

    const resolved = resolve(diff, acceptAll(diff));

    expect(openBlocks(resolved)).toBe(0);
  });

  it('leaves a shared hunk drawn until its blocks agree', () => {
    // The library resolves a hunk whole — it rewrites the addition and deletion
    // lines — so there is no way to settle one block of a hunk and keep drawing
    // the other. Answering one of two therefore changes nothing on screen, and
    // that is the honest outcome: what is still open stays visible. The ranges
    // sent to the backend come from the decisions, not from this, so the answer
    // itself is not lost.
    const diff = makeDiff(near);

    const resolved = resolve(diff, new Map([[0, 'keep']]));

    expect(openBlocks(resolved)).toBe(2);
  });

  it('settles a shared hunk once both blocks are kept', () => {
    const diff = makeDiff(near);

    const resolved = resolve(diff, new Map([[0, 'keep'], [1, 'keep']]));

    expect(openBlocks(resolved)).toBe(0);
  });

  it('settles a shared hunk once both blocks are undone', () => {
    // Undo settles it the same way; which side won is carried by
    // acceptedRanges, not by the diff on screen.
    const diff = makeDiff(near);

    const resolved = resolve(diff, new Map([[0, 'undo'], [1, 'undo']]));

    expect(openBlocks(resolved)).toBe(0);
  });

  it('leaves a shared hunk drawn when its blocks disagree', () => {
    // Keep one, undo the other: the hunk cannot be half-rewritten, so it stays.
    const diff = makeDiff(near);

    const resolved = resolve(diff, new Map([[0, 'keep'], [1, 'undo']]));

    expect(openBlocks(resolved)).toBe(2);
  });

  it('settles each block independently when they are in separate hunks', () => {
    // The ordinary case, and the one the reviewer meets most: distant edits get
    // a hunk each, so answering one takes it off the screen on its own.
    const diff = makeDiff(far);

    const resolved = resolve(diff, new Map([[0, 'keep']]));

    expect(openBlocks(resolved)).toBe(1);
  });

  it('still settles everything when the blocks are in separate hunks', () => {
    // The case that happened to work before, kept so the fix does not trade one
    // numbering for the other.
    const diff = makeDiff(far);

    const resolved = resolve(diff, acceptAll(diff));

    expect(openBlocks(resolved)).toBe(0);
  });

  it('leaves the diff it was given untouched', () => {
    // The whole basis for Reset: the original stays available to replay onto.
    const diff = makeDiff(near);

    resolve(diff, acceptAll(diff));

    expect(openBlocks(diff)).toBe(2);
  });

  it('hands back the very same object when nothing has been answered', () => {
    // The renderer holds an edit session keyed off this object. A fresh copy on
    // every render would restart it and lose the reviewer's typing.
    const diff = makeDiff(near);

    expect(resolve(diff, new Map())).toBe(diff);
  });

  it('rewrites the lines the renderer paints, not just their labels', () => {
    // The bug this test exists for: retyping a `change` entry to `context`
    // leaves `additionLines`/`deletionLines` untouched, and those are what get
    // drawn — so the answered hunk stayed on screen while the header counted it
    // as decided. Asserting on the painted text is the only way to see that.
    const diff = makeDiff(far);
    const before_ = painted(diff);

    const resolved = resolve(diff, acceptAll(diff));

    expect(painted(resolved)).not.toBe(before_);
  });

  it('hands back the original when there are no decisions at all', () => {
    // A change the backend could not split reviews whole-file: no per-block
    // controls, nothing to replay.
    const diff = makeDiff(near);

    expect(renderHook(() => useResolvedDiff(diff)).result.current).toBe(diff);
  });
});
