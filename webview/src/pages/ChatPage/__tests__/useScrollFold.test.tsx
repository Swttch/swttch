import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollFold, FOLD_MAX_HEIGHT, FOLD_MIN_HEIGHT, PINNED_TOP_INSET } from '../useScrollFold';
import { ZOOM_RECTS_ATTRIBUTE } from '@/utils/zoomRects';

/**
 * The hook reads where the send's sentinel is against the top edge, so that is
 * what this fakes, the way a browser draws it: the sentinel's place in the
 * transcript minus scrollTop. Scrolling moves it, and so does a change of
 * height above the send. The bubble is faked only as tall as it is; nothing
 * here moves it, because the hook must not read it while scrolling.
 *
 * The default puts the sentinel exactly on the top edge — a send arriving there
 * under its own scrolling, which has travelled nothing yet.
 */
function harness(startAt = 1000, restingHeight = FOLD_MAX_HEIGHT, sentinelTop = PINNED_TOP_INSET) {
  const root = document.createElement('div');
  document.body.append(root);
  root.scrollTop = startAt;
  root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

  // The fold counts down from the bubble's own height, so the harness has to
  // stand one up; jsdom reports 0 for everything otherwise.
  const bubble = document.createElement('div');
  bubble.getBoundingClientRect = () => ({ height: restingHeight }) as DOMRect;
  const bubbleRef = { current: bubble };

  // How far down the scrolled content the sentinel sits.
  let sentinelAt = sentinelTop + startAt;
  const sentinel = document.createElement('div');
  sentinel.getBoundingClientRect = () => ({ top: sentinelAt - root.scrollTop }) as DOMRect;
  const sentinelRef = { current: sentinel };

  const frame = () => {
    act(() => {
      root.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(16);
    });
  };

  return {
    root,
    bubbleRef,
    sentinelRef,
    /** Scroll the transcript by `px`; negative scrolls back up. */
    scrollBy(px: number) {
      root.scrollTop += px;
      frame();
    },
    /**
     * Make what is above the send `px` taller (negative: shorter) while the
     * reader's place holds: scrollTop moves by as much, and nothing on screen
     * moves, the send included. A page of the transcript window loaded or
     * dropped above (`useScrollAnchor`), or the browser's scroll anchoring.
     */
    resizeAbove(px: number) {
      sentinelAt += px;
      root.scrollTop += px;
      frame();
    },
  };
}

const realGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  vi.useFakeTimers();
  // The hook coalesces to one measurement per frame; drive that clock too.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
  document.body.innerHTML = '';
});

describe('useScrollFold', () => {
  it('sits at its resting height until the send pins', () => {
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, false, h.bubbleRef, h.sentinelRef).height);
    // null means "not folding" — the bubble simply sizes itself.
    expect(result.current).toBeNull();

    // Scrolling changes nothing while at rest — the bubble moves with the page.
    h.scrollBy(100);
    expect(result.current).toBeNull();
  });

  it('gives up one pixel of height per pixel scrolled', () => {
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(50);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 50);

    h.scrollBy(50);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 100);
  });

  it('keeps counting past the floor instead of clamping', () => {
    // The floor belongs to the render. If the hook clamped here, the overshoot
    // would be forgotten and the next test could not pass.
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(FOLD_MAX_HEIGHT + 500);
    expect(result.current).toBeLessThan(0);
    expect(result.current).toBe(-500);
  });

  it('unfolds only after retracing the distance it folded', () => {
    // Scroll far past the fold, then edge back up. The bubble must stay shut
    // until the scroll actually returns to where it closed — otherwise a
    // 10px nudge after a 500px scroll would pop it back open.
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(FOLD_MAX_HEIGHT + 500);
    h.scrollBy(-10);
    expect(Math.max(result.current ?? 0, FOLD_MIN_HEIGHT)).toBe(FOLD_MIN_HEIGHT);

    // Back to where the fold bottomed out: still shut, about to open.
    h.scrollBy(-490);
    expect(Math.max(result.current ?? 0, FOLD_MIN_HEIGHT)).toBe(FOLD_MIN_HEIGHT);

    // Past it, and the height starts coming back.
    h.scrollBy(-100);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - (FOLD_MAX_HEIGHT - 100));
  });

  it('recovers its full height exactly as the send unpins', () => {
    // Returning to the origin scrollTop is the same moment the send arrives
    // back at the top edge and the observer drops `pinned`. The two line up on
    // their own; neither has to tell the other.
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(200);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 200);

    h.scrollBy(-200);
    expect(result.current).toBe(FOLD_MAX_HEIGHT);
  });

  it('reads the sentinel while scrolling, never the bubble it folds', () => {
    // The shudder: measure something the fold moves, and the height chases its
    // own output frame to frame. The bubble is what the fold moves, so it is
    // read as the send pins — its box, and what its wrapper wears around the
    // box, unfolded and then folded (`wrapLoss`) — and not while scrolling.
    //
    // The sentinel is read on every scrolled frame. The fold cannot move it: it
    // sits above the bubble. That is what lets it catch a change of height above
    // the send, which a count on scrollTop cannot see (#704).
    const h = harness();
    const bubble = vi.fn(() => ({ height: FOLD_MAX_HEIGHT }) as DOMRect);
    h.bubbleRef.current.getBoundingClientRect = bubble;
    const sentinel = vi.spyOn(h.sentinelRef.current, 'getBoundingClientRect');

    renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);
    const onPin = bubble.mock.calls.length;
    const sentinelOnPin = sentinel.mock.calls.length;

    h.scrollBy(100);
    h.scrollBy(100);

    expect(onPin).toBeGreaterThan(0);
    expect(bubble.mock.calls.length).toBe(onPin);
    expect(sentinel.mock.calls.length).toBe(sentinelOnPin + 2);
  });

  it('starts already folded by whatever the send had scrolled past before pinning', () => {
    // Arriving at the top edge and pinning are the same moment only while the
    // user scrolls there. Reopening a session jumps the container to the stored
    // position first and pins afterwards, with the send long since above the
    // edge and no scrolling left to work the fold — so the distance is taken
    // from where the sentinel actually sits, not from the pin.
    const passed = 150;
    const h = harness(1000, FOLD_MAX_HEIGHT, PINNED_TOP_INSET - passed);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    expect(result.current).toBe(FOLD_MAX_HEIGHT - passed);

    // And it keeps counting from there rather than restarting.
    h.scrollBy(50);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - passed - 50);
  });

  it('unfolds on the way back up exactly where the send reaches the edge again', () => {
    // The distance taken on pin has to be retraceable like any other, or a send
    // that opened folded would pop to full height before it unpinned.
    const passed = 150;
    const h = harness(1000, FOLD_MAX_HEIGHT, PINNED_TOP_INSET - passed);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(-(passed - 10));
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 10);

    h.scrollBy(-10);
    expect(result.current).toBe(FOLD_MAX_HEIGHT);
  });

  it('stays folded when a page above the send is dropped (#704)', () => {
    // The transcript window lets go of a page at the top and holds the
    // reader's place by taking its height off scrollTop. The send has not
    // moved, so neither may the fold. Counted off scrollTop, the send read as
    // 2000px closer than it was and opened while far above the edge.
    const h = harness(5000);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(600);
    h.resizeAbove(-2000);
    expect(Math.max(result.current ?? 0, FOLD_MIN_HEIGHT)).toBe(FOLD_MIN_HEIGHT);

    // It opens on the way back up where the send really is.
    h.scrollBy(-500);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 100);
    h.scrollBy(-100);
    expect(result.current).toBe(FOLD_MAX_HEIGHT);
  });

  it('stays as it was when a page is added above the send (#704)', () => {
    // The other way round: an older page lands above, and scrollTop grows by
    // its height to hold the place. Counted off scrollTop, the send read as
    // that much further away and stayed shut until it unpinned.
    const h = harness(1000);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    h.scrollBy(100);
    h.resizeAbove(3000);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 100);

    h.scrollBy(-100);
    expect(result.current).toBe(FOLD_MAX_HEIGHT);
  });

  it('measures how far the send has travelled from the top inset it is given', () => {
    // With the top bar hidden the pinned edge is the container's own edge, not
    // 40px below it. A send sitting 150px above that edge has travelled 150px;
    // measured from the bar's line instead it would read as 190.
    const passed = 150;
    const h = harness(1000, FOLD_MAX_HEIGHT, -passed);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef, 0).height);

    expect(result.current).toBe(FOLD_MAX_HEIGHT - passed);
  });

  it('opens whole when the sentinel has not reached the edge yet', () => {
    // A pin reported while the sentinel still sits below the line has travelled
    // nothing. Letting the distance go negative would inflate the bubble past
    // the height it actually has.
    const h = harness(1000, FOLD_MAX_HEIGHT, PINNED_TOP_INSET + 120);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    expect(result.current).toBe(FOLD_MAX_HEIGHT);
  });

  it('counts down from the bubble it was given, not from the ceiling', () => {
    // FOLD_MAX_HEIGHT is only the cap. Most sends are far shorter, and driving
    // the fold from the ceiling inflated a one-line send to 280px the instant
    // it pinned, then "folded" it back down to its own size.
    const h = harness(1000, 44);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    expect(result.current).toBe(44);

    h.scrollBy(10);
    expect(result.current).toBe(34);
  });

  it('measures once per frame however many scroll events arrive', () => {
    // A trackpad outruns the compositor; a layout read and a setState per
    // event is not cheap, one per frame is.
    const h = harness();
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    act(() => {
      for (let i = 0; i < 10; i++) {
        h.root.scrollTop += 10;
        h.root.dispatchEvent(new Event('scroll'));
      }
      vi.advanceTimersByTime(16);
    });

    // All ten events collapse into a single measurement of the final position.
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 100);
  });

  it('does not render again for scrolling that leaves the drawn height where it is (#680)', () => {
    // Every send scrolled past the top counts as pinned, and a streaming reply moves scrollTop on every word. A send
    // folded shut far above must not redraw for that.
    const h = harness();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height;
    });

    h.scrollBy(FOLD_MAX_HEIGHT + 500);
    const shut = renders;
    for (let i = 0; i < 20; i++) h.scrollBy(30);
    // React may call the component once to find the state unchanged before it stops; it does not go on doing so.
    expect(renders).toBeLessThanOrEqual(shut + 1);

    // Scrolling back still unfolds where the fold closed: the distance was never forgotten.
    // 780 down, 600 more, then back up to 180 below where it pinned.
    h.scrollBy(-1200);
    expect(result.current).toBe(FOLD_MAX_HEIGHT - 180);
    expect(renders).toBeGreaterThan(shut);
  });

  it('drops its listener when the send unpins', () => {
    const h = harness();
    const remove = vi.spyOn(h.root, 'removeEventListener');
    const { rerender } = renderHook(({ pinned }) => useScrollFold(h.root, pinned, h.bubbleRef, h.sentinelRef).height, {
      initialProps: { pinned: true },
    });

    rerender({ pinned: false });
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('drops its listener on unmount', () => {
    // One pinned section at a time, but sections mount and unmount constantly
    // as the transcript pages — a leak here accumulates for the life of the page.
    const h = harness();
    const remove = vi.spyOn(h.root, 'removeEventListener');
    const { unmount } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

describe('useScrollFold under the UI zoom (#747)', () => {
  afterEach(() => {
    document.documentElement.style.zoom = '';
    document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
  });

  /**
   * The same transcript as `harness`, drawn under a page zoom: `scrollTop`, the top inset and the heights the fold
   * hands to CSS are layout pixels, while rectangles are in screen pixels on a recent Chromium ('scaled') and in
   * layout pixels on an older one.
   */
  function zoomed(zoom: number, rects: 'scaled' | 'layout', restingHeight = 250) {
    document.documentElement.style.zoom = String(zoom);
    document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, rects);
    const unit = rects === 'scaled' ? zoom : 1;
    const h = harness(1000, restingHeight);
    // The bubble holds the box the fold changes, and a footer under it.
    const box = document.createElement('div');
    box.setAttribute('data-message-box', '');
    h.bubbleRef.current.append(box);
    box.getBoundingClientRect = () => ({ height: restingHeight * unit }) as DOMRect;
    h.bubbleRef.current.getBoundingClientRect = () => ({ height: (restingHeight + 20) * unit }) as DOMRect;
    const sentinelAt = PINNED_TOP_INSET + 1000;
    h.sentinelRef.current.getBoundingClientRect = () => ({ top: (sentinelAt - h.root.scrollTop) * unit }) as DOMRect;
    return h;
  }

  it.each([
    [1.25, 'scaled'],
    [2, 'scaled'],
    [1.25, 'layout'],
  ] as const)('folds in layout pixels at zoom %s with %s rectangles', (zoom, rects) => {
    const h = zoomed(zoom, rects);
    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);

    // Nothing travelled: the bubble is its own height, not that times the zoom.
    expect(result.current).toBeCloseTo(250);

    h.scrollBy(100);
    expect(result.current).toBeCloseTo(150);
  });

  it('counts what the wrapper loses in layout pixels', () => {
    const h = zoomed(2, 'scaled');
    // The wrapper is read unfolded first and folded after: 20px around the box, then 5px.
    let reads = 0;
    h.bubbleRef.current.getBoundingClientRect = () => ({ height: (250 + (reads++ === 0 ? 20 : 5)) * 2 }) as DOMRect;

    const { result } = renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef));

    expect(result.current.wrapLoss).toBeCloseTo(15);
  });
});
