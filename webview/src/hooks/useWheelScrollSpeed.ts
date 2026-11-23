import { useEffect, useRef, type RefObject } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  WHEEL_SCROLL_SPEED_DEFAULT,
  clampWheelScrollSpeed,
  isTakenByNestedScroller,
  wheelDeltaYInPixels,
} from '@/utils/wheelScrollSpeed';

/** A wheel movement at least this many px is one notch of a mouse wheel; smaller ones are trackpad streams. */
const NOTCH_PX = 40;

/**
 * Applies the "Scroll speed" setting to wheel and trackpad scrolling inside one scroll container.
 *
 * When the speed is not 1 the container takes the scroll over: the browser's own scroll is cancelled and the
 * container is moved by the wheel distance times the speed. Adding the extra on top of the browser's own scroll
 * does not work for a mouse wheel, because moving a container from script cancels the smooth scroll animation the
 * browser has running for that same notch, so the extra replaces the browser's distance instead of adding to it.
 *
 * Cancelling needs a non-passive listener. A non-passive wheel listener makes every wheel event wait for the main
 * thread and made scrolling stutter before when it sat on the whole window (see useZoomControls, issue #267), so it
 * is only registered on this one container and only while the speed is not 1; at the default speed no listener
 * is registered at all and scrolling is entirely the browser's.
 */
export function useWheelScrollSpeed(containerRef: RefObject<HTMLElement | null>): void {
  const { settings } = useSettings();
  const speed = clampWheelScrollSpeed(settings[SettingKey.WHEEL_SCROLL_SPEED] ?? WHEEL_SCROLL_SPEED_DEFAULT);

  // The container can mount after this hook's first run (the chat shows something else while a session loads), so
  // the attachment is checked after every render and redone whenever the element or the speed is not the wired one.
  const wiredRef = useRef<{ container: HTMLElement; speed: number; detach: () => void } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const wanted = container && speed !== WHEEL_SCROLL_SPEED_DEFAULT ? container : null;
    const wired = wiredRef.current;
    if (wired && wired.container === wanted && wired.speed === speed) return;
    wired?.detach();
    wiredRef.current = null;
    if (!wanted) return;

    const onWheel = (e: WheelEvent) => {
      // Ctrl/Cmd + wheel is the browser's zoom, and a mostly horizontal movement is not a vertical scroll.
      if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const px = wheelDeltaYInPixels(e, wanted.clientHeight);
      if (isTakenByNestedScroller(e.target, wanted, px)) return;
      e.preventDefault();
      const distance = px * speed;
      if (Math.abs(px) >= NOTCH_PX) {
        // One notch of a mouse wheel: keep a smooth glide for it.
        wanted.scrollBy({ top: distance, behavior: 'smooth' });
      } else {
        // A stream of small trackpad movements: follow the fingers exactly.
        wanted.scrollTop += distance;
      }
    };

    wanted.addEventListener('wheel', onWheel, { passive: false });
    wiredRef.current = { container: wanted, speed, detach: () => wanted.removeEventListener('wheel', onWheel) };
  });

  // Take the listener off when the chat goes away.
  useEffect(
    () => () => {
      wiredRef.current?.detach();
      wiredRef.current = null;
    },
    [],
  );
}
