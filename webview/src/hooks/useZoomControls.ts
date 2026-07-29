import { useEffect } from 'react';
import { useZoom } from '@/contexts/ZoomContext';
import { isMac } from '@/config/environment';

/**
 * True when the event carries the platform's primary shortcut modifier —
 * Command on macOS, Ctrl on Windows/Linux (issue #169).
 *
 * Note the `metaKey` DOM property is NOT "the Windows equivalent of Command":
 * on Windows/Linux it reports the Super (logo) key, which belongs to the
 * desktop environment and must not trigger app shortcuts. Hence the split.
 */
export function hasCmdOrCtrl(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

/**
 * Whether a keydown means "zoom in". Browsers report the `+` key as '=' on an
 * unshifted US layout and as '+' when shifted, and numpad plus as 'Add' on
 * older engines; all spellings count so the gesture works regardless of layout.
 */
export function isZoomInKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '+' || e.key === '=' || e.key === 'Add');
}

/** Whether a keydown means "zoom out" ('-' or numpad minus). */
export function isZoomOutKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '-' || e.key === '_' || e.key === 'Subtract');
}

/** Whether a keydown means "reset zoom to 100%" — CmdOrCtrl+0, as in browsers. */
export function isZoomResetKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '0' || e.key === 'Insert');
}

/**
 * Whether a wheel event is a real wheel/trackpad-scroll with the modifier held,
 * as opposed to a pinch gesture.
 *
 * Browsers synthesise pinch-zoom as a wheel event with `ctrlKey` forced true,
 * so a naive `ctrlKey` check would swallow pinch and stop the browser's own
 * zoom from running. Two signals separate them:
 *   - a pinch never has a real Ctrl key down, so on macOS (where our modifier
 *     is Command) any ctrl-only wheel is a pinch;
 *   - a pinch reports fractional, small deltas, while a notched wheel reports
 *     whole numbers — usually a multiple of 3 (Chrome) or 40/120 (others).
 *
 * We deliberately let pinch through: zoom-by-pinch is left to the browser's
 * native handling (a product decision), and intercepting it here would break
 * that without replacing it.
 */
export function isModifiedWheel(e: WheelEvent): boolean {
  if (isMac()) {
    // On macOS our modifier is Command. A ctrl-only wheel is the synthesised
    // pinch, which must fall through to the browser.
    if (!e.metaKey) return false;
  } else if (!e.ctrlKey) {
    return false;
  }
  // A fractional delta means a continuous (pinch/precise-trackpad) stream
  // rather than a wheel notch.
  return Number.isInteger(e.deltaY);
}

/**
 * Wire CmdOrCtrl +/-/0 and CmdOrCtrl + wheel to the zoom level owned by
 * ZoomContext, which also drives the on-screen zoom indicator.
 */
export function useZoomControls(): void {
  const { zoomIn, zoomOut, reset, dismissIndicator } = useZoom();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isZoomInKey(e)) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (isZoomOutKey(e)) {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (isZoomResetKey(e)) {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === 'Escape') dismissIndicator();
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isModifiedWheel(e)) return;
      // Without preventDefault the browser runs its own page zoom on top of
      // ours, compounding the scale. Requires passive: false to take effect.
      e.preventDefault();
      if (e.deltaY === 0) return;
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [zoomIn, zoomOut, reset, dismissIndicator]);
}
