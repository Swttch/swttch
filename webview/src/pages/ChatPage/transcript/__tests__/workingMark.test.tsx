import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BOARD, MAX_SHAPES, WAVE_MS, loopFrame, loopMs, shapesAt, waveShapes } from '../workingMarkMotion';
import { FRAME_MS } from '../workingMarkFrames';
import { WorkingMark } from '../WorkingMark';

/**
 * Acceptance for: "The mark that says the model is working looks and moves the way the desktop app's does, for
 * everyone, whether or not the desktop app is installed."
 */
describe('the three-dot wave', () => {
  it('is a row of three dots on the middle line, the middle one between the outer two', () => {
    const [left, middle, right] = waveShapes(0);
    expect(left.y).toBe(BOARD / 2);
    expect(right.y).toBe(BOARD / 2);
    expect(middle.x).toBe(BOARD / 2);
    expect(left.x).toBeLessThan(middle.x);
    expect(right.x).toBeGreaterThan(middle.x);
  });

  it('draws the outer dots in and swells the middle one half-way through a turn, and returns to where it began', () => {
    const start = waveShapes(0);
    const middleOfTurn = waveShapes(WAVE_MS * 0.45);
    expect(middleOfTurn[0].x).toBeGreaterThan(start[0].x);
    expect(middleOfTurn[2].x).toBeLessThan(start[2].x);
    expect(middleOfTurn[1].rx).toBeGreaterThan(start[1].rx);
    expect(middleOfTurn[0].rx).toBeLessThan(start[0].rx);
    const again = waveShapes(WAVE_MS);
    start.forEach((shape, i) => {
      expect(again[i].x).toBeCloseTo(shape.x, 5);
      expect(again[i].rx).toBeCloseTo(shape.rx, 5);
    });
  });
});

describe('the looping activities', () => {
  it.each(['think', 'code', 'read'] as const)('%s plays a loop of frames, thirty a second, and starts again at the end', (activity) => {
    expect(loopMs(activity)).toBeGreaterThan(1500);
    expect(loopFrame(activity, 0)).toBe(loopFrame(activity, loopMs(activity)));
    expect(loopFrame(activity, FRAME_MS * 3 + 1)).toBe(loopFrame(activity, FRAME_MS * 3 + 1 + loopMs(activity)));
  });

  it.each(['think', 'code', 'read'] as const)('%s keeps every shape on the board and never draws more than the mark has room for', (activity) => {
    for (let ms = 0; ms < loopMs(activity); ms += FRAME_MS) {
      const shapes = shapesAt(activity, ms);
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes.length).toBeLessThanOrEqual(MAX_SHAPES);
      for (const shape of shapes) {
        expect(shape.x - shape.rx).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.rx).toBeLessThanOrEqual(BOARD);
        expect(shape.y - shape.ry).toBeGreaterThanOrEqual(0);
        expect(shape.y + shape.ry).toBeLessThanOrEqual(BOARD);
      }
    }
  });

  it('draws four dots for a command, one in each corner of the board at first', () => {
    const first = shapesAt('code', 0);
    expect(first).toHaveLength(4);
    const quadrants = first.map((s) => `${s.x < BOARD / 2 ? 'left' : 'right'}-${s.y < BOARD / 2 ? 'top' : 'bottom'}`);
    expect(new Set(quadrants).size).toBe(4);
  });
});

describe('WorkingMark', () => {
  it('has room for the shapes of a moving activity, and shows the ones the first moment has', () => {
    render(<WorkingMark activity="think" />);
    const mark = screen.getByTestId('working-mark');
    expect(mark.getAttribute('data-activity')).toBe('think');
    const drawn = [...mark.querySelectorAll('ellipse')].filter((e) => Number(e.getAttribute('rx')) > 0);
    expect(drawn).toHaveLength(shapesAt('think', 0).length);
  });

  it.each(['think', 'code', 'read', 'default'] as const)('draws the %s activity', (activity) => {
    render(<WorkingMark activity={activity} />);
    expect(screen.getByTestId('working-mark').getAttribute('data-activity')).toBe(activity);
  });

  it('draws a disc inside a ring, and nothing that moves, while the work waits on the person', () => {
    render(<WorkingMark activity="blocked" />);
    const mark = screen.getByTestId('working-mark');
    const circles = [...mark.querySelectorAll('circle')];
    expect(circles).toHaveLength(2);
    expect(circles[0].getAttribute('fill')).toBe('#f0ac55');
    expect(circles[1].getAttribute('fill')).toBe('none');
    expect(mark.querySelectorAll('ellipse')).toHaveLength(0);
  });

  it('is as big as it is asked to be', () => {
    render(<WorkingMark activity="default" size={32} />);
    expect(screen.getByTestId('working-mark').getAttribute('width')).toBe('32');
  });
});
