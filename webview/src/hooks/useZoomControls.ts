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
 * Numpad keys are matched on `e.code`, never `e.key` (issue #268).
 *
 * `e.key` carries a key's *meaning*, which on the numpad flips with NumLock:
 * numpad 0 reads '0' while NumLock is on but 'Insert' while it is off. Matching
 * that spelling therefore misses the numpad half the time and — worse — claims
 * the standalone Insert key, whose Ctrl+Insert / Shift+Insert are Chromium's
 * built-in copy/paste (`ui/views/controls/textfield/textfield.cc`, VKEY_INSERT
 * → COPY/PASTE). Swallowing those broke copying out of the chat.
 *
 * `e.code` names the physical key ('Numpad0' vs 'Insert') whatever NumLock says,
 * mirroring the VKEY_NUMPAD0 / VKEY_INSERT split Chromium itself keys off. Its
 * accelerator table (`chrome/browser/ui/accelerator_table.cc`) binds zoom to
 * VKEY_0 / VKEY_NUMPAD0 and never mentions VKEY_INSERT — we match it exactly.
 */

/**
 * Whether a keydown means "zoom in" — the number-row plus, reported as '=' on an
 * unshifted US layout and '+' when shifted, or numpad plus by its physical code.
 * Mirrors Chromium's VKEY_OEM_PLUS / VKEY_ADD pair.
 */
export function isZoomInKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd');
}

/**
 * Whether a keydown means "zoom out" — number-row minus or numpad minus,
 * mirroring Chromium's VKEY_OEM_MINUS / VKEY_SUBTRACT pair.
 */
export function isZoomOutKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract');
}

/**
 * Whether a keydown means "reset zoom to 100%" — CmdOrCtrl+0 on the number row
 * or on the numpad, mirroring Chromium's VKEY_0 / VKEY_NUMPAD0 pair. The
 * standalone Insert key is deliberately excluded so Ctrl+Insert stays a copy.
 */
export function isZoomResetKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '0' || e.code === 'Numpad0');
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
