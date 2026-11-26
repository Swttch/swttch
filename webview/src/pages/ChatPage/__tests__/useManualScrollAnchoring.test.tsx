import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZOOM_RECTS_ATTRIBUTE } from '@/utils/zoomRects';
import { useManualScrollAnchoring } from '../useManualScrollAnchoring';

/**
 * #747. WebKit before Safari 27 leaves the page where it is when something above the reader changes height, and the
 * reader loses their place. jsdom lays nothing out: a column of rows with layout heights is imitated.
 */
let resized: (() => void) | null = null;
let observers = 0;

beforeEach(() => {
  resized = null;
  observers = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
        observers++;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.zoom = '';
  document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
  document.body.innerHTML = '';
});

function page({ supported = false, zoom = 1, following = false } = {}) {
  vi.stubGlobal('CSS', { supports: () => supported });
  document.documentElement.style.zoom = String(zoom);
  document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, 'scaled');
  const container = document.createElement('div');
  document.body.append(container);
  let scrollTop = 0;
  Object.defineProperty(container, 'scrollTop', { get: () => scrollTop, set: (v: number) => (scrollTop = v) });
  container.getBoundingClientRect = () => ({ top: 0, bottom: 300 * zoom, height: 300 * zoom }) as DOMRect;

  const heights = [100, 100, 100, 100, 100];
  const rows = heights.map((_, index) => {
    const row = document.createElement('div');
    row.getBoundingClientRect = () => {
      const above = heights.slice(0, index).reduce((sum, h) => sum + h, 0);
      return { top: (above - scrollTop) * zoom, bottom: (above + heights[index] - scrollTop) * zoom, height: heights[index] * zoom } as DOMRect;
    };
    container.append(row);
    return row;
  });

  const follow = { current: following };
  scrollTop = 150;
  const view = renderHook(() => useManualScrollAnchoring({ current: container }, follow));
  return {
    container,
    note: () => view.result.current.note(),
    scrollTop: () => scrollTop,
    scroll: (to: number) => {
      scrollTop = to;
      container.dispatchEvent(new Event('scroll'));
    },
    grow: (row: number, by: number) => (heights[row] += by),
    /** Where the third row, the first to begin on the screen, stands below the top, in layout pixels. */
    third: () => rows[2].getBoundingClientRect().top / zoom,
  };
}

describe('useManualScrollAnchoring', () => {
  it.each([1, 1.25, 2])('holds what is being read when something above grows, at zoom %s', (zoom) => {
    const p = page({ zoom });
    expect(p.third()).toBeCloseTo(50);

    p.grow(0, 80);
    resized?.();

    expect(p.third()).toBeCloseTo(50);
    expect(p.scrollTop()).toBeCloseTo(230);
  });

  it('counts what was scrolled as scrolled, when the scroll is told before the change of size', () => {
    const p = page();
    p.grow(0, 80);
    p.scroll(140);

    // Ten pixels up by the reader, eighty made up for.
    expect(p.scrollTop()).toBeCloseTo(220);
    expect(p.third()).toBeCloseTo(60);
  });

  // The transcript wraps what it draws in elements that have no box (`display: contents`). Passed over, the walk
  // stopped at what began above the screen, and what grew inside that moved the reader unseen.
  it('looks inside a wrapper that has no box of its own', () => {
    const p = page();
    const { container } = p;
    // The rows, now inside a block that begins above the screen, behind a wrapper without a box.
    const block = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    wrapper.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect;
    wrapper.append(...Array.from(container.children));
    block.append(wrapper);
    block.getBoundingClientRect = () => ({ top: -p.scrollTop(), bottom: 500 - p.scrollTop(), height: 500 }) as DOMRect;
    container.append(block);
    p.note();

    p.grow(0, 80);
    resized?.();

    expect(p.third()).toBeCloseTo(50);
  });

  it('goes on past a block of which only the padding is left in view', () => {
    const p = page();
    const second = p.container.children[1] as HTMLElement;
    // The second row ends in a stretch of its own padding: what it holds has gone above the screen.
    const inner = document.createElement('div');
    inner.getBoundingClientRect = () => ({ top: second.getBoundingClientRect().top, bottom: -10, height: 40 }) as DOMRect;
    second.append(inner);
    p.note();

    p.grow(1, 80);
    resized?.();

    // The third row, the first to begin on the screen, stays where it was.
    expect(p.third()).toBeCloseTo(50);
  });

  it('leaves a scroll of the reader alone', () => {
    const p = page();
    p.scroll(40);
    p.scroll(260);
    expect(p.scrollTop()).toBe(260);
  });

  it('moves nothing while the page follows the newest message', () => {
    const p = page({ following: true });
    p.grow(0, 80);
    resized?.();
    expect(p.scrollTop()).toBe(150);
  });

  it('does not make up again for what was made up for when a page was added', () => {
    const p = page();
    // The page keeper has moved the page by what arrived above, and says so.
    p.grow(0, 80);
    p.scroll(150);
    const after = p.scrollTop();
    p.note();
    resized?.();
    expect(p.scrollTop()).toBe(after);
  });

  it('stays out of the way of a browser that holds the place itself', () => {
    const p = page({ supported: true });
    p.grow(0, 80);
    resized?.();
    p.scroll(150);
    expect(p.scrollTop()).toBe(150);
    expect(observers).toBe(0);
  });
});
