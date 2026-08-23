/**
 * Where a hunk's control is anchored.
 *
 * A hunk BEGINS three lines of context before it changes anything, as `git diff`
 * writes them. Anchoring a control to `newStart` therefore puts it beside a line
 * the hunk does not touch — which is what shipped first: the checkbox sat two
 * rows above the change it decided, next to code that was not changing.
 *
 * Nothing in the type system distinguishes those two line numbers, so this is
 * the only thing standing between the two.
 */
import { describe, it, expect } from 'vitest';
import { firstChangedLine, type Hunk } from '@/shared';

/** A hunk as computeHunks emits one: context, then the change, then context. */
function hunk(lines: string[], newStart = 20): Hunk {
  return { index: 0, oldStart: newStart, oldLines: 1, newStart, newLines: 1, lines };
}

describe('firstChangedLine', () => {
  it('skips the leading context', () => {
    // Lines 20, 21, 22 are context; the addition is on 23.
    expect(
      firstChangedLine(hunk([' a', ' b', ' c', '+new', ' d'])),
    ).toBe(23);
  });

  it('is the hunk start when the change comes first', () => {
    // A hunk at the top of a file has no room for leading context.
    expect(firstChangedLine(hunk(['+new', ' a', ' b']))).toBe(20);
  });

  it('does not count removed lines, which are not on the proposed side', () => {
    // The two deletions occupy no proposed line, so the addition is still 22.
    expect(
      firstChangedLine(hunk([' a', ' b', '-gone', '-also gone', '+new'])),
    ).toBe(22);
  });

  it('falls back to the hunk start for a change that only deletes', () => {
    // Nothing was added, so there is no proposed line to point at; the control
    // goes where the removed lines were.
    expect(firstChangedLine(hunk([' a', ' b', '-gone', ' c']))).toBe(20);
  });

  // The bug this exists to prevent, stated as the thing that was wrong.
  it('is not simply the hunk start when context precedes the change', () => {
    const h = hunk([' a', ' b', ' c', '+new']);
    expect(firstChangedLine(h)).not.toBe(h.newStart);
  });
});
