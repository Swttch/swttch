import { describe, it, expect, afterEach, vi } from 'vitest';
import tippy from 'tippy.js/headless';
import { rectsFollowZoom, installZoomRects, rectMetrics, ZOOM_RECTS_ATTRIBUTE } from '../zoomRects';

/**
 * jsdom lays nothing out, so each Chromium is imitated through the width a box reports: `zoom` on the box itself
 * scales it (Chromium 128 and later) or does not (the older one inside a JetBrains IDE).
 */
function reportRects(scalesOwnZoom: boolean, pageZoom: number) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // jsdom drops `zoom` from a style, so the box that has one of its own is told by its probe mark.
    const own = this.getAttribute('data-zoom-probe') === 'zoomed' ? 0.5 : 1;
    const width = 100 * pageZoom * (scalesOwnZoom ? own : 1);
    return { width, height: width, top: 0, left: 0, right: width, bottom: width, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

describe('rectsFollowZoom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
    // installZoomRects changes what every Tippy starts from; the next test begins without it.
    tippy.setDefaultProps({ popperOptions: {} });
  });

  it('is true where a box reports its own zoom (rectangles in screen pixels), at any page zoom', () => {
    for (const pageZoom of [0.9, 1, 1.5, 2]) {
      reportRects(true, pageZoom);
      expect(rectsFollowZoom()).toBe(true);
      vi.restoreAllMocks();
    }
  });

  it('is false where it does not (rectangles in layout pixels), at any page zoom', () => {
    for (const pageZoom of [0.9, 1, 1.5, 2]) {
      reportRects(false, pageZoom);
      expect(rectsFollowZoom()).toBe(false);
      vi.restoreAllMocks();
    }
  });

  it('is false where nothing is laid out, and leaves no box behind', () => {
    expect(rectsFollowZoom()).toBe(false);
    expect(document.body.children.length).toBe(0);
  });

  it('marks <html> with the answer for index.css', () => {
    reportRects(true, 0.9);
    installZoomRects();
    expect(document.documentElement.getAttribute(ZOOM_RECTS_ATTRIBUTE)).toBe('scaled');

    vi.restoreAllMocks();
    reportRects(false, 0.9);
    installZoomRects();
    expect(document.documentElement.getAttribute(ZOOM_RECTS_ATTRIBUTE)).toBe('layout');
  });

  describe('rectMetrics, for a menu placed by hand', () => {
    const withZoom = (zoom: number, rects: 'scaled' | 'layout') => {
      document.documentElement.style.zoom = String(zoom);
      document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, rects);
    };
    afterEach(() => {
      document.documentElement.style.zoom = '';
    });

    it('divides a rectangle by the zoom where rectangles are in screen pixels, and keeps it where in layout pixels', () => {
      withZoom(0.9, 'scaled');
      expect(rectMetrics().toFixed(90)).toBeCloseTo(100);
      withZoom(0.9, 'layout');
      expect(rectMetrics().toFixed(100)).toBeCloseTo(100);
    });

    it('turns a layout length into the pixels the rectangles are in', () => {
      withZoom(0.9, 'scaled');
      expect(rectMetrics().fromLayout(100)).toBeCloseTo(90);
      withZoom(0.9, 'layout');
      expect(rectMetrics().fromLayout(100)).toBeCloseTo(100);
    });

    it('gives the window in the pixels the rectangles are in', () => {
      withZoom(0.5, 'scaled');
      expect(rectMetrics().viewH).toBe(window.innerHeight);
      withZoom(0.5, 'layout');
      expect(rectMetrics().viewH).toBeCloseTo(window.innerHeight / 0.5);
    });

    it('counts rectangles as screen pixels where nothing has been measured, and as zoom 1 without a zoom', () => {
      document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
      document.documentElement.style.zoom = '0.8';
      expect(rectMetrics().toFixed(80)).toBeCloseTo(100);
      document.documentElement.style.zoom = '';
      expect(rectMetrics().toFixed(80)).toBe(80);
    });
  });

  describe('anchoring of poppers on the headless Tippy', () => {
    const anchored = () =>
      (tippy.defaultProps.popperOptions?.modifiers ?? []).some(
        (m) => m.name === 'computeStyles' && (m.options as { adaptive?: boolean } | undefined)?.adaptive === false,
      );

    afterEach(() => {
      tippy.setDefaultProps({ popperOptions: {} });
    });

    it('is by the top edge where rectangles are in layout pixels, and left alone where they are in screen pixels', () => {
      reportRects(true, 0.9);
      installZoomRects();
      expect(anchored()).toBe(false);

      vi.restoreAllMocks();
      reportRects(false, 0.9);
      installZoomRects();
      expect(anchored()).toBe(true);
    });
  });
});
