/**
 * Carrying the reviewer's typing across a rebuilt proposal (#359).
 *
 * Caught in QA: after the file moved on disk and the reviewer pressed Refresh,
 * an edit from `CLAUDE` to `CLAUDE22` disappeared with nothing said about it.
 * A rebuild restates the ORIGINAL side; typing lives on the PROPOSED side, so
 * unless both landed on the same line there is nothing to lose.
 */
import { describe, it, expect } from 'vitest';
import { mergeEdits } from '../mergeEdits';

const lines = (...ls: string[]) => ls.join('\n') + '\n';

describe('mergeEdits', () => {
  it('takes the new proposal when nothing was typed', () => {
    const before = lines('a', 'b', 'c');
    const next = lines('a', 'B', 'c');

    expect(mergeEdits(before, before, next)).toEqual({
      contents: next,
      conflicts: [],
      carried: false,
    });
  });

  it('keeps typing on lines the rebuild did not touch', () => {
    // The QA case: the reviewer typed on one line, the rebuild changed another.
    const before = lines('a', 'CLAUDE', 'c');
    const typed = lines('a', 'CLAUDE22', 'c');
    const next = lines('A', 'CLAUDE', 'c');

    const result = mergeEdits(before, typed, next);

    expect(result.contents).toBe(lines('A', 'CLAUDE22', 'c'));
    expect(result.conflicts).toEqual([]);
    expect(result.carried).toBe(true);
  });

  it('reports a conflict when both sides rewrote the same line', () => {
    const before = lines('a', 'x', 'c');
    const typed = lines('a', 'MINE', 'c');
    const next = lines('a', 'THEIRS', 'c');

    const result = mergeEdits(before, typed, next);

    // The new proposal wins: it is the one stated against content that exists.
    expect(result.contents).toBe(lines('a', 'THEIRS', 'c'));
    expect(result.conflicts).toEqual([2]);
  });

  it('is not a conflict when both arrived at the same text', () => {
    const before = lines('a', 'x', 'c');
    const same = lines('a', 'SAME', 'c');

    const result = mergeEdits(before, same, same);

    expect(result.contents).toBe(same);
    expect(result.conflicts).toEqual([]);
  });

  it('carries several edits at once', () => {
    const before = lines('a', 'b', 'c', 'd');
    const typed = lines('a', 'B!', 'c', 'D!');
    const next = lines('A', 'b', 'c', 'd');

    const result = mergeEdits(before, typed, next);

    expect(result.contents).toBe(lines('A', 'B!', 'c', 'D!'));
    expect(result.carried).toBe(true);
  });

  it('gives up on the merge when the typing changed the line count', () => {
    // Every line after an insertion has moved, so "my line 3" and "its line 3"
    // are no longer the same line. Guessing there would put text somewhere the
    // reviewer never looked.
    const before = lines('a', 'b', 'c');
    const typed = lines('a', 'b', 'EXTRA', 'c');
    const next = lines('A', 'b', 'c');

    const result = mergeEdits(before, typed, next);

    expect(result.contents).toBe(next);
    expect(result.carried).toBe(false);
    // Reported rather than dropped in silence, which is the whole point.
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('gives up when the rebuild changed the line count', () => {
    const before = lines('a', 'b', 'c');
    const typed = lines('a', 'B!', 'c');
    const next = lines('a', 'b', 'c', 'extra');

    const result = mergeEdits(before, typed, next);

    expect(result.contents).toBe(next);
    expect(result.carried).toBe(false);
  });

  it('preserves a missing trailing newline', () => {
    const before = 'a\nb';
    const typed = 'a\nB!';
    const next = 'A\nb';

    expect(mergeEdits(before, typed, next).contents).toBe('A\nB!');
  });

  it('handles an empty proposal without inventing a line', () => {
    expect(mergeEdits('', '', 'new\n').contents).toBe('new\n');
  });
});
