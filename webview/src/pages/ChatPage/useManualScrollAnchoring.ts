import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { rectMetrics } from '@/utils/zoomRects';

/** Whether the browser holds the reader's place by itself when something above them changes height. */
export function browserAnchorsScroll(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'auto');
}

interface Held {
  element: Element;
  /** How far below the top of the scroll container its top edge was, as a rectangle reports it. */
  offset: number;
  scrollTop: number;
}

/** The elements drawn directly inside one: a wrapper that has no box of its own stands for what it wraps. */
function boxesIn(element: Element): Element[] {
  return Array.from(element.children).flatMap((child) => (getComputedStyle(child).display === 'contents' ? boxesIn(child) : [child]));
}

/**
 * The element to hold the place on: the first one that begins on the screen, as deep as it takes to find one. An
 * element that began above the screen says nothing about what grew inside it, so it is looked into, and when nothing
 * inside it begins on the screen (only its own padding is left in view) the search goes on after it.
 */
function elementInView(container: Element): Element | null {
  const top = container.getBoundingClientRect().top;
  const firstIn = (element: Element): Element | null => {
    for (const child of boxesIn(element)) {
      const rect = child.getBoundingClientRect();
      if (rect.height <= 0 || rect.bottom <= top + 1) continue;
      // What stays on the screen while the rest scrolls (a pinned send, the find bar) is not where the reader is.
      const { position } = getComputedStyle(child);
      if (position === 'sticky' || position === 'fixed' || position === 'absolute') continue;
      if (rect.top >= top) return child;
      const deeper = firstIn(child);
      if (deeper) return deeper;
    }
    return null;
  };
  return firstIn(container);
}

/**
 * Keep the reader's place when something above them changes height, on a browser that does not do it by itself
 * (WebKit before Safari 27, which every browser on iOS before it is): a picture that arrives, a code block that is
 * drawn when it comes near, a diagram. Without it each of those moves what is being read (#747). Pages added to the
 * transcript are held by `useScrollAnchor` on every browser; after it has moved the page, `note` is called so that
 * the same change is not made up for twice.
 *
 * Where the browser does this itself, nothing is listened to.
 */
export function useManualScrollAnchoring(
  scrollRef: RefObject<HTMLElement | null>,
  /** True while the page follows the newest message: the follow moves it, and nothing else may. */
  followRef: RefObject<boolean>,
) {
  const heldRef = useRef<Held | null>(null);
  const enabledRef = useRef(!browserAnchorsScroll());

  const note = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !enabledRef.current) return;
    const element = elementInView(container);
    heldRef.current = element
      ? { element, offset: element.getBoundingClientRect().top - container.getBoundingClientRect().top, scrollTop: container.scrollTop }
      : null;
  }, [scrollRef]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !enabledRef.current || typeof ResizeObserver === 'undefined') return;

    /*
     * What the held element moved by beyond what was scrolled is what the content above it changed by. Both a
     * change of size and a scroll ask: a scroll event can reach the page before the change of size is told.
     */
    const keep = () => {
      const held = heldRef.current;
      if (held && held.element.isConnected && !followRef.current) {
        const moved = held.element.getBoundingClientRect().top - container.getBoundingClientRect().top - held.offset;
        const shift = rectMetrics().toFixed(moved) + (container.scrollTop - held.scrollTop);
        if (Math.abs(shift) >= 1) container.scrollTop += shift;
      }
      note();
    };

    const resize = new ResizeObserver(keep);
    const watch = () => {
      for (const child of Array.from(container.children)) resize.observe(child);
    };
    watch();
    const children = new MutationObserver(watch);
    children.observe(container, { childList: true });
    container.addEventListener('scroll', keep, { passive: true });
    note();
    return () => {
      resize.disconnect();
      children.disconnect();
      container.removeEventListener('scroll', keep);
    };
  }, [scrollRef, followRef, note]);

  return { note };
}
