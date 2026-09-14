import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollFold, FOLD_MAX_HEIGHT, FOLD_MIN_HEIGHT, PINNED_TOP_INSET } from '../useScrollFold';

/**
 * Once the send is pinned the hook reads one number — the container's scrollTop
 * — so that is nearly all this has to fake. It deliberately does NOT model
 * element positions *per frame*: measuring those on every scroll is what made
 * the fold feed on its own output and shudder.
 *
 * Positions are modelled for the single reading taken as the send pins, which
 * is where the fold learns how far the send had already travelled. The default
 * puts the sentinel exactly on the top edge — a send arriving there under its
 * own scrolling, which has travelled nothing yet.
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

  const sentinel = document.createElement('div');
  sentinel.getBoundingClientRect = () => ({ top: sentinelTop }) as DOMRect;
  const sentinelRef = { current: sentinel };

  return {
    root,
    bubbleRef,
    sentinelRef,
    /** Scroll the transcript by `px`; negative scrolls back up. */
    scrollBy(px: number) {
      root.scrollTop += px;
      act(() => {
        root.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(16);
      });
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

  it('measures on pin and never again while scrolling', () => {
    // The shudder: folding shortens the document, the elements below shift, a
    // position-based measurement returns something new, and the height
    // oscillates frame to frame. Re-measuring during the scroll is how that
    // gets in — so every element is read as the send pins and never after, and
    // every frame beyond that is arithmetic on scrollTop.
    const h = harness();
    const bubble = vi.fn(() => ({ height: FOLD_MAX_HEIGHT }) as DOMRect);
    const root = vi.fn(() => ({ top: 0 }) as DOMRect);
    const sentinel = vi.fn(() => ({ top: PINNED_TOP_INSET }) as DOMRect);
    h.bubbleRef.current.getBoundingClientRect = bubble;
    h.root.getBoundingClientRect = root;
    h.sentinelRef.current.getBoundingClientRect = sentinel;

    renderHook(() => useScrollFold(h.root, true, h.bubbleRef, h.sentinelRef).height);
    const onPin = [bubble, root, sentinel].map(fn => fn.mock.calls.length);

    h.scrollBy(100);
    h.scrollBy(100);

    // One reading each as it pins, and not one more across two scrolled frames.
    expect(onPin).toEqual([1, 1, 1]);
    expect([bubble, root, sentinel].map(fn => fn.mock.calls.length)).toEqual([1, 1, 1]);
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
    // A trackpad outruns the compositor; one layout-free read is cheap but a
    // setState per event is not.
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
