import { describe, it, expect } from 'vitest';
import { DockSection } from '../moveDockItem';
import { resolveDropTarget, type MeasuredRow, type MeasuredSection } from '../resolveDropTarget';

// Docked section spans y 0–100 with two rows (midpoints 25 and 75);
// hidden section spans y 100–200 with two rows (midpoints 125 and 175).
const SECTIONS: MeasuredSection[] = [
  { section: DockSection.DOCKED, top: 0, bottom: 100 },
  { section: DockSection.HIDDEN, top: 100, bottom: 200 },
];

const ROWS: MeasuredRow[] = [
  { section: DockSection.DOCKED, middle: 25, index: 0 },
  { section: DockSection.DOCKED, middle: 75, index: 1 },
  { section: DockSection.HIDDEN, middle: 125, index: 0 },
  { section: DockSection.HIDDEN, middle: 175, index: 1 },
];

describe('resolveDropTarget', () => {
  it('inserts before the first row whose midpoint the pointer has not passed', () => {
    expect(resolveDropTarget(10, ROWS, SECTIONS)).toEqual({ section: DockSection.DOCKED, index: 0 });
    expect(resolveDropTarget(60, ROWS, SECTIONS)).toEqual({ section: DockSection.DOCKED, index: 1 });
  });

  it('appends when the pointer is past every row in the section', () => {
    expect(resolveDropTarget(95, ROWS, SECTIONS)).toEqual({ section: DockSection.DOCKED, index: 2 });
  });

  it('resolves into the other section by pointer position alone', () => {
    expect(resolveDropTarget(110, ROWS, SECTIONS)).toEqual({ section: DockSection.HIDDEN, index: 0 });
    expect(resolveDropTarget(190, ROWS, SECTIONS)).toEqual({ section: DockSection.HIDDEN, index: 2 });
  });

  // Without this, an empty dock could never be populated — there is no row to aim
  // at, so the section container has to be the target.
  it('targets index 0 of a section that has no rows', () => {
    const hiddenOnly = ROWS.filter((r) => r.section === DockSection.HIDDEN);
    expect(resolveDropTarget(50, hiddenOnly, SECTIONS)).toEqual({
      section: DockSection.DOCKED,
      index: 0,
    });
  });

  it('clamps to the nearest section when dragged above or below everything', () => {
    expect(resolveDropTarget(-50, ROWS, SECTIONS)).toEqual({ section: DockSection.DOCKED, index: 0 });
    expect(resolveDropTarget(500, ROWS, SECTIONS)).toEqual({ section: DockSection.HIDDEN, index: 2 });
  });

  it('returns null when there is nothing measured to drop onto', () => {
    expect(resolveDropTarget(10, [], [])).toBeNull();
  });

  // The result must depend only on where the pointer is, so a drag that passes
  // through a position resolves the same as one that arrives there directly.
  it('is direction-independent', () => {
    expect(resolveDropTarget(60, ROWS, SECTIONS)).toEqual(resolveDropTarget(60, [...ROWS].reverse(), SECTIONS));
  });
});
