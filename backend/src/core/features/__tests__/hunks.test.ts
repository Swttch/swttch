/**
 * Partial approval is only trustworthy if the two extremes are exact: taking
 * every hunk must reproduce Claude's proposal byte for byte, and taking none
 * must leave the file untouched. Everything in between is judged against those.
 */
import { describe, it, expect } from 'vitest';
import { computeHunks, applySelectedHunks } from '../hunks';

const all = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('computeHunks', () => {
  it('finds nothing to review when the two sides match', () => {
    expect(computeHunks('same\n', 'same\n')).toEqual([]);
  });

  it('splits changes that are far apart into separate hunks', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const after = before.replace('line 2', 'CHANGED 2').replace('line 30', 'CHANGED 30');

    const hunks = computeHunks(before, after);
    expect(hunks).toHaveLength(2);
  });

  it('keeps changes that sit close together in one hunk', () => {
    // Two edits a line apart cannot sensibly be accepted separately, and
    // offering them as two choices invites a state the user did not mean.
    const before = 'a\nb\nc\nd\ne\n';
    const after = 'A\nb\nC\nd\ne\n';
    expect(computeHunks(before, after)).toHaveLength(1);
  });

  it('reports line numbers a reviewer can locate', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const after = before.replace('line 10', 'CHANGED');

    const [hunk] = computeHunks(before, after)!;
    // Line 11 (1-based) changed, so the hunk starts three lines of context earlier.
    expect(hunk.oldStart).toBe(8);
    expect(hunk.lines.some((l) => l === '-line 10')).toBe(true);
    expect(hunk.lines.some((l) => l === '+CHANGED')).toBe(true);
  });

  it('handles a file created from nothing', () => {
    const hunks = computeHunks('', 'first\nsecond\n')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toEqual(['+first', '+second']);
  });
});

describe('applySelectedHunks', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
  const after = before.replace('line 2', 'CHANGED 2').replace('line 30', 'CHANGED 30');

  it('accepting every hunk reproduces the proposal exactly', () => {
    const hunks = computeHunks(before, after)!;
    expect(applySelectedHunks(before, after, all(hunks.length))).toBe(after);
  });

  it('accepting no hunk leaves the original untouched', () => {
    expect(applySelectedHunks(before, after, [])).toBe(before);
  });

  it('accepting one hunk applies that change and no other', () => {
    const out = applySelectedHunks(before, after, [0])!;
    expect(out).toContain('CHANGED 2');
    expect(out).not.toContain('CHANGED 30');
    expect(out).toContain('line 30');
  });

  it('accepting the other hunk applies only that one', () => {
    const out = applySelectedHunks(before, after, [1])!;
    expect(out).not.toContain('CHANGED 2');
    expect(out).toContain('line 2');
    expect(out).toContain('CHANGED 30');
  });

  it('round-trips a pure deletion', () => {
    const src = 'keep\ndrop\nkeep2\n';
    const dst = 'keep\nkeep2\n';
    const hunks = computeHunks(src, dst)!;
    expect(applySelectedHunks(src, dst, all(hunks.length))).toBe(dst);
    expect(applySelectedHunks(src, dst, [])).toBe(src);
  });

  it('round-trips a pure insertion', () => {
    const src = 'a\nb\n';
    const dst = 'a\nmiddle\nb\n';
    const hunks = computeHunks(src, dst)!;
    expect(applySelectedHunks(src, dst, all(hunks.length))).toBe(dst);
    expect(applySelectedHunks(src, dst, [])).toBe(src);
  });

  it('preserves a file that ends without a newline', () => {
    const src = 'a\nb';
    const dst = 'a\nB';
    const hunks = computeHunks(src, dst)!;
    expect(applySelectedHunks(src, dst, all(hunks.length))).toBe(dst);
    expect(applySelectedHunks(src, dst, [])).toBe(src);
  });

  it('round-trips a new file', () => {
    const dst = 'fresh\n';
    expect(applySelectedHunks('', dst, [0])).toBe(dst);
    expect(applySelectedHunks('', dst, [])).toBe('');
  });

  it('round-trips three separated changes in every combination', () => {
    const src = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n') + '\n';
    const dst = src.replace('l5', 'X5').replace('l25', 'X25').replace('l45', 'X45');
    const hunks = computeHunks(src, dst)!;
    expect(hunks).toHaveLength(3);

    // Every subset must produce exactly the changes it names and no others.
    for (let mask = 0; mask < 8; mask++) {
      const picked = [0, 1, 2].filter((i) => mask & (1 << i));
      const out = applySelectedHunks(src, dst, picked)!;
      for (const [i, marker] of [[0, 'X5'], [1, 'X25'], [2, 'X45']] as const) {
        if (picked.includes(i)) expect(out, `mask ${mask}`).toContain(marker);
        else expect(out, `mask ${mask}`).not.toContain(marker);
      }
    }
  });
});
