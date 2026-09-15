export const FAVICON_DEFAULT = '/favicon.svg';
export const FAVICON_UNREAD = '/favicon-unread.svg';

/** Media type of the two static favicons, and of the link tag in `index.html`. */
const TYPE_SVG = 'image/svg+xml';

/** Media type of the baked spinner frames. */
const TYPE_PNG = 'image/png';

/**
 * Point the page's one favicon link at [href].
 *
 * The media type is reassigned along with the address. `index.html` declares
 * `type="image/svg+xml"`, so leaving it alone while swapping in a PNG data URL
 * hands the browser a link whose declared type contradicts its content, and
 * what it does with that is its own business rather than ours to rely on.
 */
function setFavicon(href: string, type: string): void {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) return;
  if (link.type !== type) {
    link.type = type;
  }
  if (link.href !== href) {
    link.href = href;
  }
}

/**
 * Swap the favicon to the unread variant. Idempotent — safe to call
 * repeatedly while the user is away.
 */
export function setUnreadFavicon(): void {
  setFavicon(FAVICON_UNREAD, TYPE_SVG);
}

/**
 * Restore the default favicon. Idempotent.
 */
export function restoreDefaultFavicon(): void {
  setFavicon(FAVICON_DEFAULT, TYPE_SVG);
}

/**
 * Whether the current favicon is the unread variant. Reads from the DOM so
 * that any code path (useDocumentTitle, useAwaitingNotifications, …) that
 * sets the unread state is correctly reflected here without coordinating
 * through shared React state.
 */
export function hasUnreadFavicon(): boolean {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) return false;
  return link.href.includes('favicon-unread');
}

// ---------------------------------------------------------------------------
// Working spinner (issue #449)
//
// While a response streams, the favicon turns, so a user who has moved to
// another tab can still see that the session is running. The JetBrains hosts
// show the same arc on their tab icons (`WorkingTabIcon` on the Kotlin side);
// the two are drawn by different means but are meant to read as one shape.
// ---------------------------------------------------------------------------

/**
 * Claude's orange.
 *
 * Repeated here rather than imported because the places that own it are SVG
 * assets (`public/favicon.svg`, `src/main/resources/icons/claudeCode.svg`),
 * which export nothing. Change it in all three or the spinner stops matching
 * the icon it spins around.
 */
const WORKING_COLOR = '#D97757';

/** Frame canvas size. A tab strip draws the favicon at 16px; this is 2x for hidpi. */
const FRAME_SIZE = 32;

/**
 * Frames per turn, and how long each one is shown.
 *
 * These two are chosen against a measured ceiling rather than by feel: Chrome
 * repaints a tab's favicon about 3.7 times a second, and it does so whether the
 * tab is in front or behind (measured by recording the tab strip at 20fps for
 * 10 seconds in each state: 37 changes both times, longest hold 0.35s and 0.30s).
 *
 * Writing faster than that ceiling is not merely wasted, it is what the eye
 * reads as stuttering: two thirds of the frames never reach the screen, and
 * which third survives shifts from turn to turn, so the arc lurches by an
 * uneven angle each time instead of advancing steadily. Assigning one frame per
 * [FRAME_MS] instead means every frame written is a frame drawn. Measured
 * across four write intervals, the drawn rate never moves: 100ms of writes
 * draws 3.8/s, 150ms draws 3.4/s, 200ms draws 3.1/s, 270ms draws 3.6/s.
 *
 * With the steps per second fixed, the turn speed and the step size trade
 * directly against each other, and only the frame count sets where that lands.
 * 13 frames comes back around in 3.5 seconds at 28 degrees a step; 20 frames
 * halves the step to 18 but takes 5.4 seconds, which reads as sluggish rather
 * than smooth. The faster turn is the better read.
 */
const FRAME_COUNT = 13;

/** How long one frame is shown. The reciprocal is the write rate, ~3.7/s. */
const FRAME_MS = 270;

/** Arc thickness, in [FRAME_SIZE] units. */
const STROKE_WIDTH = 5;

/** Clear space left outside the stroke, in [FRAME_SIZE] units. */
const MARGIN = 1;

// One full turn is FRAME_COUNT * FRAME_MS, so 3.51 seconds.

let frames: string[] | null = null;

/**
 * Bake every frame once, as PNG data URLs.
 *
 * Baking up front is what keeps the running cost to a single string
 * assignment per frame. Encoding a PNG on every tick instead would pay for an
 * encode and a decode 25 times a second for as long as the response streams.
 *
 * The arc covers 270 degrees. The 90 left open are what make the turning
 * visible: a closed ring looks identical in every frame.
 */
function buildFrames(): string[] {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  // The stroke straddles the path, so half of it falls outside the arc's own
  // circle. Pulling the radius in by that half plus the margin keeps the drawn
  // edge inside the canvas.
  const radius = FRAME_SIZE / 2 - STROKE_WIDTH / 2 - MARGIN;

  return Array.from({ length: FRAME_COUNT }, (_, i) => {
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.save();
    ctx.translate(FRAME_SIZE / 2, FRAME_SIZE / 2);
    ctx.rotate((i / FRAME_COUNT) * Math.PI * 2);
    ctx.strokeStyle = WORKING_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    // Round, so the ends stay legible once the browser scales this down to 16px.
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
    return canvas.toDataURL('image/png');
  });
}

type StopTimer = () => void;

/**
 * Drive [onTick] from a Web Worker rather than the main thread.
 *
 * This is the whole reason the spinner works where it is needed. Chrome
 * throttles a hidden tab's `setInterval` to once a second, and
 * `requestAnimationFrame` stops outright — and a hidden tab is exactly the
 * situation this feature exists for. Measured on a plain Chrome with the tab
 * backgrounded for 400 seconds: a main-thread interval fell to 1.0/s (median
 * gap 1000ms) while the same interval inside a worker held 24.7/s (median gap
 * 40ms). The browser still repaints the tab strip for a hidden tab, so the
 * frames the worker drives do reach the screen.
 *
 * Falls back to a main-thread interval where a worker cannot be created (a
 * page whose CSP forbids `blob:` workers, say). The spinner then crawls in a
 * hidden tab rather than disappearing.
 */
function startTimer(onTick: () => void): StopTimer {
  const source =
    'let id;onmessage=e=>{clearInterval(id);if(e.data)id=setInterval(()=>postMessage(0),e.data)}';
  try {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    worker.postMessage(FRAME_MS);
    return () => {
      worker.postMessage(0);
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, FRAME_MS);
    return () => window.clearInterval(id);
  }
}

let stopTimer: StopTimer | null = null;
let index = 0;

/** Whether the favicon is currently turning. */
export function isWorkingFavicon(): boolean {
  return stopTimer !== null;
}

/**
 * Start turning the favicon. Idempotent — a second call while it is already
 * turning leaves the current rotation alone rather than snapping it back to
 * the first frame.
 */
export function startWorkingFavicon(): void {
  if (stopTimer) return;
  if (!frames) frames = buildFrames();
  const baked = frames;
  // No canvas means no frames to show; the favicon simply stays as it was.
  if (!baked.length) return;

  index = 0;
  setFavicon(baked[0], TYPE_PNG);

  stopTimer = startTimer(() => {
    index = (index + 1) % baked.length;
    setFavicon(baked[index], TYPE_PNG);
  });
}

/**
 * Stop turning the favicon and put the default one back.
 *
 * Restores the default rather than whatever was showing before, because the
 * caller that wants the unread variant sets it right after this returns.
 */
export function stopWorkingFavicon(): void {
  if (!stopTimer) return;
  stopTimer();
  stopTimer = null;
  restoreDefaultFavicon();
}
