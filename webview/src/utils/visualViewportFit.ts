/**
 * Keeps the chat frame inside the part of the screen the virtual keyboard leaves visible.
 *
 * The chat frame is `position: fixed` and as tall as the layout viewport. Chrome on Android shrinks the layout viewport
 * when the keyboard opens (`interactive-widget=resizes-content` in index.html), so the frame shrinks with it. Safari on
 * iOS ignores that hint: the layout viewport keeps its full height and the keyboard is drawn over its lower part, so
 * the chat input and the end of the transcript sit behind the keyboard. Only the visual viewport shrinks there, and
 * Safari pans it up and down over the layout viewport to keep the focused field in sight.
 *
 * This publishes the visual viewport's height and its offset from the top of the layout viewport as `--vv-height` and
 * `--vv-top`, in screen pixels, and marks `<html>` with `data-vv-fit`. index.css then places the chat frame
 * (`[data-app-frame]`) at that offset and gives it that height, so the frame always ends at the top of the keyboard,
 * wherever Safari has panned. Where the layout viewport does shrink, the numbers equal the full window and nothing
 * changes.
 */

/** The attribute index.css reads to size the chat frame from the variables below. */
export const VV_FIT_ATTRIBUTE = 'data-vv-fit';

/** Write the visual viewport's current height and top offset to `<html>`. */
export function writeVisualViewportVariables(vv: Pick<VisualViewport, 'height' | 'offsetTop'>): void {
  const root = document.documentElement;
  root.style.setProperty('--vv-height', `${vv.height}px`);
  // Safari can report a small negative offset while it rubber-bands; the frame should never move above the page.
  root.style.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
}

/**
 * Start following the visual viewport. Returns a function that stops it and removes the variables again.
 * Does nothing (and returns a no-op) where the browser has no `visualViewport`.
 */
export function installVisualViewportFit(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    // Pinch-zoomed, the visual viewport is a magnified part of the page rather than the room the keyboard leaves.
    // Following it would lay the chat out again inside the magnified part, so the frame goes back to the full
    // layout viewport until the reader zooms out again.
    if (Math.abs(vv.scale - 1) > 0.01) {
      root.removeAttribute(VV_FIT_ATTRIBUTE);
      return;
    }
    writeVisualViewportVariables(vv);
    root.setAttribute(VV_FIT_ATTRIBUTE, '');
  };
  // `resize` and `scroll` both fire many times while the keyboard slides in; one write per painted frame is enough.
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };

  update();
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);

  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    root.removeAttribute(VV_FIT_ATTRIBUTE);
    root.style.removeProperty('--vv-height');
    root.style.removeProperty('--vv-top');
  };
}
