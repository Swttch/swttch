import tippy from 'tippy.js/headless';

/**
 * Which way this Chromium reports an element's rectangle under CSS `zoom`.
 *
 * `<html>` carries CSS `zoom` (utils/zoom.ts, `--ui-zoom`). Chromium 128 and later hand `getBoundingClientRect()` back
 * in SCREEN pixels, so an element drawn at 90% reports 90% of its layout size. The Chromium inside an older JetBrains
 * IDE (122 in 2024.2) hands it back in LAYOUT pixels, before the zoom is applied. Tippy places a popper from those
 * rectangles and writes the result into `transform: translate(x, y)`, so the same CSS has to treat the translation
 * differently on the two: the rule in index.css that cancels the zoom for a popper is right where rectangles are in
 * screen pixels and doubles the error where they are in layout pixels (a menu above its button hung about 10% of its
 * distance from the top of the page too low, 65px on a 740px window at 90%).
 *
 * The page cannot ask the browser, so it measures: a box inside its own `zoom: 0.5` is compared with a box that has no
 * zoom of its own. Both sit under the page zoom, so only the box's own zoom tells the two apart, at any page zoom.
 */
export function rectsFollowZoom(): boolean {
  const plain = document.createElement('div');
  plain.setAttribute('data-zoom-probe', 'plain');
  plain.style.cssText = 'position:absolute;left:-9999px;top:0;width:100px;height:100px;visibility:hidden';
  const zoomed = document.createElement('div');
  zoomed.setAttribute('data-zoom-probe', 'zoomed');
  zoomed.style.cssText = 'position:absolute;left:-9999px;top:0;width:100px;height:100px;visibility:hidden;zoom:0.5';
  document.body.append(plain, zoomed);
  const plainWidth = plain.getBoundingClientRect().width;
  const zoomedWidth = zoomed.getBoundingClientRect().width;
  plain.remove();
  zoomed.remove();
  // Scaled by its own zoom: about half of the plain box. Not scaled: the same. No box at all (a test DOM): not scaled.
  return plainWidth > 0 && zoomedWidth / plainWidth < 0.75;
}

/** The attribute index.css reads to decide whether the popper zoom cancelling applies. */
export const ZOOM_RECTS_ATTRIBUTE = 'data-zoom-rects';

/**
 * Popper anchors a popper placed ABOVE its button by the bottom edge of the page (`bottom: 0`, then a negative translate
 * worked out from `<html>`'s `clientHeight`), and one placed below by its top edge. Where rectangles are in layout
 * pixels `clientHeight` is in the other unit from the rest, so an upper popper hangs lower than it should; one anchored
 * by the top edge needs no `clientHeight`. This anchors every popper that way, on the headless build of Tippy that the
 * app renders through (`@tippyjs/react/headless`; defaults set on 'tippy.js' never reach it).
 */
export function anchorPoppersByTopEdge(): void {
  tippy.setDefaultProps({ popperOptions: { modifiers: [{ name: 'computeStyles', options: { adaptive: false } }] } });
}

/**
 * What a menu placed by hand needs to turn a rectangle (`getBoundingClientRect`, a range's rectangle) into the numbers a
 * `fixed` element is given, on either kind of Chromium (see `rectsFollowZoom`).
 *
 * - `toFixed(v)`: a length read from a rectangle, as the `top`/`left`/`width` a fixed element takes (the page zoom
 *   scales those once more, so screen pixels are divided by it and layout pixels are left as they are).
 * - `fromLayout(v)`: a length the layout knows (`offsetHeight`, a number written in the stylesheet), in the unit the
 *   rectangles are in, to be compared with them.
 * - `viewW`, `viewH`: the window's size in the unit the rectangles are in. `innerWidth`/`innerHeight` are always screen
 *   pixels, and a rectangle is not on a Chromium that reports layout pixels.
 *
 * Where `installZoomRects` has not run (a test DOM) rectangles count as screen pixels, as on a recent Chromium.
 */
export function rectMetrics() {
  const parsed = parseFloat(document.documentElement.style.zoom);
  const zoom = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  // How many screen pixels one pixel of a rectangle is: 1 for screen pixels, the zoom for layout pixels.
  const unit = document.documentElement.getAttribute(ZOOM_RECTS_ATTRIBUTE) === 'layout' ? zoom : 1;
  return {
    zoom,
    toFixed: (v: number) => (v * unit) / zoom,
    fromLayout: (v: number) => (v * zoom) / unit,
    viewW: window.innerWidth / unit,
    viewH: window.innerHeight / unit,
  };
}

/**
 * Mark `<html>` with how this Chromium reports rectangles, before anything is placed, and where they are in layout
 * pixels make the poppers anchor by their top edge. Where they are in screen pixels nothing is needed.
 */
export function installZoomRects(): void {
  const scaled = rectsFollowZoom();
  document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, scaled ? 'scaled' : 'layout');
  if (!scaled) anchorPoppersByTopEdge();
}
