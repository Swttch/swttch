/**
 * Replaying the reviewer's answers onto the original diff.
 *
 * Two properties this depends on, both of them the library's behaviour rather
 * than ours, and neither visible in a type signature:
 *
 *  1. `diffAcceptRejectHunk` does not mutate its input, which is what lets a
 *     resolved hunk come back — Reset just replays a different answer set onto
 *     the untouched original.
 *  2. Resolving a hunk renumbers the ones after it, so answers have to be
 *     applied from the last hunk backwards. Forwards, the second answer lands
 *     on a hunk that has already shifted out from under its index.
 *
 * If either changes in a library upgrade, the review writes the wrong lines to
 * a file — so both are asserted here directly against the library.
 */
import { describe, it, expect } from 'vitest';
import { parseDiffFromFile, diffAcceptRejectHunk, type FileDiffMetadata } from '@pierre/diffs';

const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const after = before.replace('line 5', 'FIVE').replace('line 16', 'SIXTEEN');

function makeDiff(): FileDiffMetadata {
  return parseDiffFromFile(
    { name: 'f.txt', contents: before },
    { name: 'f.txt', contents: after },
  );
}

/**
 * What each hunk still shows as changed.
 *
 * Read from `hunkContent[].type`, NOT from `additionCount`/`deletionCount`.
 * Those two count every line the hunk displays, context included, so they are
 * identical before and after a hunk is resolved — measuring with them says
 * "nothing happened" no matter what you do.
 *
 * Resolving turns a `change` entry into `context`, which is the difference this
 * page draws and therefore the one worth asserting.
 */
function shape(diff: FileDiffMetadata): string {
  return JSON.stringify(
    (diff as unknown as { hunks: { hunkContent: { type: string }[] }[] }).hunks.map((h) =>
      h.hunkContent.map((c) => c.type),
    ),
  );
}

/** Whether [diff] still has anything left for the reviewer to answer. */
function hasOpenChanges(diff: FileDiffMetadata): boolean {
  return (diff as unknown as { hunks: { hunkContent: { type: string }[] }[] }).hunks.some((h) =>
    h.hunkContent.some((c) => c.type === 'change'),
  );
}

function hunkCount(diff: FileDiffMetadata): number {
  return (diff as unknown as { hunks: unknown[] }).hunks.length;
}

describe('diffAcceptRejectHunk, as this page relies on it', () => {
  it('splits two distant edits into separate hunks', () => {
    // The rest of this file is meaningless with only one hunk.
    expect(hunkCount(makeDiff())).toBe(2);
  });

  it('leaves the diff it was given untouched', () => {
    // The whole basis for Reset: the original stays available to replay onto.
    const original = makeDiff();
    const snapshot = shape(original);

    diffAcceptRejectHunk(original, 0, 'accept');

    expect(shape(original)).toBe(snapshot);
  });

  it('returns a new object rather than the one passed in', () => {
    const original = makeDiff();
    expect(diffAcceptRejectHunk(original, 0, 'accept')).not.toBe(original);
  });

  it('keeps a resolved hunk in the list, as context', () => {
    // The control has to stay somewhere, so Reset has a place to live. A hunk
    // that vanished from the array entirely would take its own undo with it.
    const resolved = diffAcceptRejectHunk(makeDiff(), 0, 'accept');
    expect(hunkCount(resolved)).toBe(hunkCount(makeDiff()));
  });

  it('resolves every hunk the same way whichever end you start from', () => {
    // If this ever fails, the replay order in useResolvedDiff is load-bearing
    // in a way this test no longer describes — read it before changing it.
    const total = hunkCount(makeDiff());

    let backwards = makeDiff();
    for (let i = total - 1; i >= 0; i--) {
      backwards = diffAcceptRejectHunk(backwards, i, 'accept');
    }

    let forwards = makeDiff();
    for (let i = 0; i < total; i++) {
      forwards = diffAcceptRejectHunk(forwards, i, 'accept');
    }

    expect(shape(backwards)).toBe(shape(forwards));
  });

  it('settles both hunks when the answers differ', () => {
    // The case that matters: keep one, undo the other. Applied backwards, which
    // is what useResolvedDiff does.
    expect(hasOpenChanges(makeDiff())).toBe(true);

    const mixed = diffAcceptRejectHunk(
      diffAcceptRejectHunk(makeDiff(), 1, 'reject'),
      0,
      'accept',
    );

    expect(hasOpenChanges(mixed)).toBe(false);
  });

  it('leaves the other hunk open when only one is answered', () => {
    // Half-answered is the ordinary state of a review, and the half that is
    // still open has to stay drawn as a change.
    const one = diffAcceptRejectHunk(makeDiff(), 0, 'accept');

    const types = (one as unknown as { hunks: { hunkContent: { type: string }[] }[] }).hunks;
    expect(types[0].hunkContent.some((c) => c.type === 'change')).toBe(false);
    expect(types[1].hunkContent.some((c) => c.type === 'change')).toBe(true);
  });
});
