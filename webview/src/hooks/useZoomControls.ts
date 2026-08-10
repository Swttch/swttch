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
 * Wire CmdOrCtrl +/-/0 to the zoom level owned by ZoomContext, which also drives
 * the on-screen zoom indicator.
 *
 * Zoom-by-wheel (CmdOrCtrl + wheel) used to live here too, and was REMOVED
 * because it made scrolling stutter across the whole app.
 *
 * Reading a wheel event is harmless; being able to CANCEL one is not. Because
 * the handler called preventDefault() to stop the browser's own zoom from
 * compounding ours, the listener had to be registered `passive: false`. That
 * tells the browser "this listener may cancel the scroll", so every wheel event
 * — on every page, whether or not a modifier was held — had to wait for the
 * main thread to run the handler before the scroll could be applied, instead of
 * being handled straight off the compositor. Trackpads emit wheel events far
 * faster than mice do, so the events queued up and scrolling kept running for
 * seconds after the user's fingers left the trackpad (issue #267, and the
 * 2026-08-03 marketplace review reporting "10-15 FPS").
 *
 * Pinch-to-zoom on a trackpad still works: browsers handle it natively, which is
 * what the removed handler already deliberately let through.
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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [zoomIn, zoomOut, reset, dismissIndicator]);
}
