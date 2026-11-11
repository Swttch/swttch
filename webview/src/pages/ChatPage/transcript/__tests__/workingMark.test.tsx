import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BOARD, ORBIT_LAP_MS, WAVE_MS, orbitDots, waveDots } from '../workingMarkMotion';
import { WorkingMark } from '../WorkingMark';

/**
 * Acceptance for: "The mark that says the model is working looks and moves the way the desktop app's does, for
 * everyone, whether or not the desktop app is installed."
 */
describe('the three-dot wave', () => {
  it('is a row of three dots on the middle line, the middle one between the outer two', () => {
    const [left, middle, right] = waveDots(0);
    expect(left.y).toBe(BOARD / 2);
    expect(right.y).toBe(BOARD / 2);
    expect(middle.x).toBe(BOARD / 2);
    expect(left.x).toBeLessThan(middle.x);
    expect(right.x).toBeGreaterThan(middle.x);
  });

  it('draws the outer dots in and swells the middle one half-way through a turn, and returns to where it began', () => {
    const start = waveDots(0);
    const middleOfTurn = waveDots(WAVE_MS * 0.45);
    expect(middleOfTurn[0].x).toBeGreaterThan(start[0].x);
    expect(middleOfTurn[2].x).toBeLessThan(start[2].x);
    expect(middleOfTurn[1].r).toBeGreaterThan(start[1].r);
    expect(middleOfTurn[0].r).toBeLessThan(start[0].r);
    const again = waveDots(WAVE_MS);
    start.forEach((dot, i) => {
      expect(again[i].x).toBeCloseTo(dot.x, 5);
      expect(again[i].r).toBeCloseTo(dot.r, 5);
    });
  });

  it('keeps the outer dots mirrored about the middle', () => {
    const [left, , right] = waveDots(500);
    expect(BOARD - right.x).toBeCloseTo(left.x, 5);
  });
});

describe('the thinking orbit', () => {
  it('keeps three dots on the board at every moment', () => {
    for (let ms = 0; ms < ORBIT_LAP_MS * 3; ms += 37) {
      const dots = orbitDots(ms);
      expect(dots).toHaveLength(3);
      for (const dot of dots) {
        expect(dot.x - dot.r).toBeGreaterThanOrEqual(0);
        expect(dot.x + dot.r).toBeLessThanOrEqual(BOARD);
        expect(dot.y - dot.r).toBeGreaterThanOrEqual(0);
        expect(dot.y + dot.r).toBeLessThanOrEqual(BOARD);
      }
    }
  });

  it('is flat while the ring is edge-on, and opens up and down while it tips', () => {
    expect(orbitDots(0).every((dot) => dot.y === BOARD / 2)).toBe(true);
    const open = orbitDots(460).map((dot) => dot.y);
    expect(Math.max(...open) - Math.min(...open)).toBeGreaterThan(8);
  });
});

describe('WorkingMark', () => {
  it('draws three dots for an activity that moves', () => {
    render(<WorkingMark activity="think" />);
    const mark = screen.getByTestId('working-mark');
    expect(mark.getAttribute('data-activity')).toBe('think');
    expect(mark.querySelectorAll('circle')).toHaveLength(3);
    // Placed at once, before the first animation frame.
    expect(mark.querySelector('circle')?.getAttribute('r')).not.toBeNull();
  });

  it('draws a disc inside a ring, and nothing that moves, while the work waits on the person', () => {
    render(<WorkingMark activity="blocked" />);
    const circles = [...screen.getByTestId('working-mark').querySelectorAll('circle')];
    expect(circles).toHaveLength(2);
    expect(circles[0].getAttribute('fill')).toBe('#f0ac55');
    expect(circles[1].getAttribute('fill')).toBe('none');
  });

  it('is as big as it is asked to be', () => {
    render(<WorkingMark activity="default" size={32} />);
    expect(screen.getByTestId('working-mark').getAttribute('width')).toBe('32');
  });
});
