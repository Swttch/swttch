import { describe, it, expect } from 'vitest';
import { indexFromOffset, stepRatio } from '../geometry';

// The shipped track box (index.css `.effort-slider`). Kept here only to exercise
// a realistic size; the round-trip property below is what actually matters and
// it is checked across a range of widths too.
const TRACK = 72;
const THUMB = 12;
const INSET = 2;

// 5 effort levels + the ultracode top step.
const COUNT = 6;

describe('effort slider geometry', () => {
  it('resolves a click on a notch back to that same notch', () => {
    for (let i = 0; i < COUNT; i++) {
      const ratio = stepRatio(i, COUNT, TRACK, THUMB, INSET);
      const offset = ratio * TRACK;
      expect(indexFromOffset(offset, COUNT, TRACK, THUMB, INSET)).toBe(i);
    }
  });

  // #377: the top notch is drawn well inside the track's right edge, so mapping
  // the click over the full width made it resolve to the level below. Clicking
  // the purple dot left ultracode unreachable.
  it('reaches the ultracode top step by clicking its notch', () => {
    const top = COUNT - 1;
    const offset = stepRatio(top, COUNT, TRACK, THUMB, INSET) * TRACK;
    expect(indexFromOffset(offset, COUNT, TRACK, THUMB, INSET)).toBe(top);
  });

  it('reaches the first step by clicking its notch', () => {
    const offset = stepRatio(0, COUNT, TRACK, THUMB, INSET) * TRACK;
    expect(indexFromOffset(offset, COUNT, TRACK, THUMB, INSET)).toBe(0);
  });

  it('round-trips every notch at other track widths and step counts', () => {
    for (const width of [56, 72, 96, 120]) {
      for (const count of [2, 4, 5, 6]) {
        for (let i = 0; i < count; i++) {
          const offset = stepRatio(i, count, width, THUMB, INSET) * width;
          expect(indexFromOffset(offset, count, width, THUMB, INSET)).toBe(i);
        }
      }
    }
  });

  it('clamps a drag past either edge to the end steps', () => {
    expect(indexFromOffset(-50, COUNT, TRACK, THUMB, INSET)).toBe(0);
    expect(indexFromOffset(TRACK + 50, COUNT, TRACK, THUMB, INSET)).toBe(COUNT - 1);
  });

  it('treats a track too narrow to hold the thumb as a single step', () => {
    expect(indexFromOffset(5, COUNT, 8, THUMB, INSET)).toBe(0);
  });
});
