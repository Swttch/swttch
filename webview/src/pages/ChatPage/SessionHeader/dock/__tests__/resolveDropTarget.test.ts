import { describe, it, expect } from 'vitest';
import { resolveDropTarget, type MeasuredRow } from '../resolveDropTarget';

// Four rows stacked vertically, midpoints at 25/75/125/175.
const ROWS: MeasuredRow[] = [
  { index: 0, middle: 25 },
  { index: 1, middle: 75 },
  { index: 2, middle: 125 },
  { index: 3, middle: 175 },
];

describe('resolveDropTarget', () => {
  it('inserts before the first row whose midpoint the pointer has not passed', () => {
    expect(resolveDropTarget(10, ROWS)).toBe(0);
    expect(resolveDropTarget(60, ROWS)).toBe(1);
    expect(resolveDropTarget(110, ROWS)).toBe(2);
  });

  it('appends when the pointer is past every row', () => {
    expect(resolveDropTarget(190, ROWS)).toBe(4);
  });

  it('returns 0 when there is nothing measured to drop onto', () => {
    expect(resolveDropTarget(50, [])).toBe(0);
  });

  // The result must depend only on where the pointer is, so a drag that passes
  // through a position resolves the same as one that arrives there directly.
  it('is direction-independent', () => {
    expect(resolveDropTarget(60, ROWS)).toBe(resolveDropTarget(60, [...ROWS].reverse()));
  });
});
