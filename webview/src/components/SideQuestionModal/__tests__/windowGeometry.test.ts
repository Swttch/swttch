import { describe, it, expect } from 'vitest';
import {
  ResizeEdge,
  defaultRect,
  maximizedRect,
  minimizedRect,
  moveRect,
  resizeRect,
  clampRect,
  MIN_SIZE,
  MAXIMIZED_MARGIN_PX,
  MINIMIZED_SIZE_PX,
  type Rect,
} from '../windowGeometry';

const viewport = { width: 1200, height: 800 };
const start: Rect = { left: 300, top: 200, width: 600, height: 400 };

describe('windowGeometry', () => {
  describe('maximizedRect', () => {
    it('fills the viewport leaving 1rem (16px) on every side', () => {
      expect(MAXIMIZED_MARGIN_PX).toBe(16);
      expect(maximizedRect(viewport)).toEqual({ left: 16, top: 16, width: 1168, height: 768 });
    });

    // 1rem is not always 16px: the webview's root font size is the user's own setting.
    it('uses the margin it is given, so 1rem follows the root font size', () => {
      expect(maximizedRect(viewport, 13)).toEqual({ left: 13, top: 13, width: 1174, height: 774 });
    });
  });

  describe('defaultRect', () => {
    it('is centred in the viewport', () => {
      const r = defaultRect(viewport);
      expect(r.left + r.width / 2).toBeCloseTo(viewport.width / 2);
      expect(r.top + r.height / 2).toBeCloseTo(viewport.height / 2);
    });

    it('never exceeds the viewport minus the 1rem margin, even in a tiny window', () => {
      const r = defaultRect({ width: 320, height: 300 });
      expect(r.width).toBeLessThanOrEqual(320 - 2 * MAXIMIZED_MARGIN_PX);
      expect(r.height).toBeLessThanOrEqual(300 - 2 * MAXIMIZED_MARGIN_PX);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
    });
  });

  describe('minimizedRect', () => {
    it('is a small square, the footprint of a floating button, whose right edge sits 16px inside the viewport', () => {
      const r = minimizedRect(viewport, 800);
      expect(r.width).toBe(MINIMIZED_SIZE_PX);
      expect(r.height).toBe(MINIMIZED_SIZE_PX);
      expect(r.left + r.width).toBe(viewport.width - 16);
    });

    it('keeps the right gap it is given', () => {
      const r = minimizedRect(viewport, 800, 13);
      expect(r.left + r.width).toBe(viewport.width - 13);
    });

    it('rests on the given bottom line (the top of the chat input)', () => {
      const r = minimizedRect(viewport, 700);
      expect(r.top + r.height).toBe(700);
    });

    it('stays inside the viewport when the bottom line is out of range', () => {
      const r = minimizedRect(viewport, 5000);
      expect(r.top + r.height).toBeLessThanOrEqual(viewport.height);
    });
  });

  describe('moveRect', () => {
    it('follows the pointer by exactly the distance it moved', () => {
      expect(moveRect(start, 50, -20, viewport)).toEqual({ ...start, left: 350, top: 180 });
    });

    it('does not carry the window out of the viewport', () => {
      expect(moveRect(start, -9999, -9999, viewport)).toEqual({ ...start, left: 0, top: 0 });
      const far = moveRect(start, 9999, 9999, viewport);
      expect(far.left + far.width).toBe(viewport.width);
      expect(far.top + far.height).toBe(viewport.height);
    });
  });

  describe('resizeRect', () => {
    it('east edge: the right side follows the pointer, the left side stays', () => {
      expect(resizeRect(start, ResizeEdge.East, 80, 0, viewport)).toEqual({ ...start, width: 680 });
    });

    it('west edge: the left side follows the pointer, the right side stays', () => {
      const r = resizeRect(start, ResizeEdge.West, -80, 0, viewport);
      expect(r.left).toBe(220);
      expect(r.left + r.width).toBe(start.left + start.width);
    });

    it('south edge: the bottom follows the pointer, the top stays', () => {
      expect(resizeRect(start, ResizeEdge.South, 0, 60, viewport)).toEqual({ ...start, height: 460 });
    });

    it('north edge: the top follows the pointer, the bottom stays', () => {
      const r = resizeRect(start, ResizeEdge.North, 0, -60, viewport);
      expect(r.top).toBe(140);
      expect(r.top + r.height).toBe(start.top + start.height);
    });

    it('a corner moves both of its edges', () => {
      const r = resizeRect(start, ResizeEdge.NorthWest, -40, -30, viewport);
      expect(r).toEqual({ left: 260, top: 170, width: 640, height: 430 });
      const se = resizeRect(start, ResizeEdge.SouthEast, 40, 30, viewport);
      expect(se).toEqual({ ...start, width: 640, height: 430 });
    });

    it('stops at the minimum size and the opposite edge does not drift', () => {
      const r = resizeRect(start, ResizeEdge.West, 9999, 0, viewport);
      expect(r.width).toBe(MIN_SIZE.width);
      expect(r.left + r.width).toBe(start.left + start.width);

      const t = resizeRect(start, ResizeEdge.North, 0, 9999, viewport);
      expect(t.height).toBe(MIN_SIZE.height);
      expect(t.top + t.height).toBe(start.top + start.height);
    });

    it('stops at the viewport edge', () => {
      const e = resizeRect(start, ResizeEdge.East, 9999, 0, viewport);
      expect(e.left + e.width).toBe(viewport.width);
      const w = resizeRect(start, ResizeEdge.West, -9999, 0, viewport);
      expect(w.left).toBe(0);
    });

    it('is computed from the start rect, so the same pointer position always gives the same window', () => {
      const once = resizeRect(start, ResizeEdge.SouthEast, 25, 25, viewport);
      const again = resizeRect(start, ResizeEdge.SouthEast, 25, 25, viewport);
      expect(again).toEqual(once);
    });
  });

  describe('clampRect', () => {
    it('pulls a window back after the viewport shrank', () => {
      const r = clampRect({ left: 900, top: 600, width: 600, height: 400 }, { width: 800, height: 500 });
      expect(r.left + r.width).toBeLessThanOrEqual(800);
      expect(r.top + r.height).toBeLessThanOrEqual(500);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
    });

    it('leaves a window that already fits alone', () => {
      expect(clampRect(start, viewport)).toEqual(start);
    });
  });
});
