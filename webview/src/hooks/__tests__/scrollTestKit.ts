import { vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';

/**
 * Test-only stand-ins for the two things jsdom does not do and useAutoScroll
 * depends on: animation frames, and layout.
 *
 * jsdom has no layout engine, so every scroll metric reads 0, and its
 * requestAnimationFrame fires on a wall-clock timer the test cannot step. Both
 * are replaced here with versions a test drives by hand: frames run only when
 * `flushFrames` is called, and scroll metrics are whatever the test sets, with
 * `scrollTop` clamped the way a browser clamps it.
 */

export interface RafQueue {
  /** Run `count` animation frames, one after another, inside `act`. */
  flushFrames(count?: number): void;
}

export function installRafQueue(): RafQueue {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    nextId += 1;
    queue.set(nextId, cb);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id);
  });
  return {
    flushFrames(count = 1) {
      for (let i = 0; i < count; i++) {
        const callbacks = Array.from(queue.values());
        queue = new Map();
        act(() => {
          for (const cb of callbacks) cb(0);
        });
      }
    },
  };
}

export interface ScrollBox {
  readonly el: HTMLElement;
  /** Change the content height, as new content landing would. */
  setScrollHeight(value: number): void;
  /** Move the view, as the user dragging the scrollbar would, and fire `scroll`. */
  userScrollTo(top: number): void;
  /** Every `scrollTo` call made on the element, in order. */
  readonly scrollToCalls: ScrollToOptions[];
  /** The most recent `scrollTo` call, if any. */
  lastScrollTo(): ScrollToOptions | undefined;
}

/**
 * Give an element real-looking scroll metrics.
 *
 * `scrollTo` is applied immediately whatever its `behavior`, since there is no
 * animation to wait for here; the call itself is recorded so a test can still
 * say whether it asked for a smooth or an instant move.
 */
export function stubScrollBox(
  el: HTMLElement,
  init: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): ScrollBox {
  let scrollHeight = init.scrollHeight;
  const clientHeight = init.clientHeight;
  const clamp = (v: number) => Math.max(0, Math.min(v, Math.max(0, scrollHeight - clientHeight)));
  let top = clamp(init.scrollTop ?? 0);
  const scrollToCalls: ScrollToOptions[] = [];

  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = clamp(v);
    },
  });
  Object.defineProperty(el, 'scrollTo', {
    configurable: true,
    value: (opts: ScrollToOptions) => {
      scrollToCalls.push(opts);
      if (typeof opts.top === 'number') top = clamp(opts.top);
    },
  });

  return {
    el,
    setScrollHeight(value: number) {
      scrollHeight = value;
      top = clamp(top);
    },
    userScrollTo(value: number) {
      top = clamp(value);
      fireEvent.scroll(el);
    },
    scrollToCalls,
    lastScrollTo: () => scrollToCalls[scrollToCalls.length - 1],
  };
}
