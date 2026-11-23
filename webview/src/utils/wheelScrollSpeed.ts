/** Scroll speed setting: how far one wheel or trackpad movement scrolls the chat, as a multiplier of the usual distance. */
export const WHEEL_SCROLL_SPEED_DEFAULT = 1;
export const WHEEL_SCROLL_SPEED_MIN = 0.5;
export const WHEEL_SCROLL_SPEED_MAX = 5;
export const WHEEL_SCROLL_SPEED_STEP = 0.25;

/** The height of one text line, in px, used to turn a wheel that reports lines into pixels. */
const LINE_PX = 16;

/** Clamp a user-supplied speed into the supported range; anything that is not a number becomes the default. */
export function clampWheelScrollSpeed(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return WHEEL_SCROLL_SPEED_DEFAULT;
  return Math.min(WHEEL_SCROLL_SPEED_MAX, Math.max(WHEEL_SCROLL_SPEED_MIN, n));
}

/** The vertical distance of a wheel event in px, whatever unit (pixels, lines, pages) the device reports in. */
export function wheelDeltaYInPixels(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, pageHeight: number): number {
  if (e.deltaMode === 1) return e.deltaY * LINE_PX;
  if (e.deltaMode === 2) return e.deltaY * pageHeight;
  return e.deltaY;
}

/**
 * Whether a nested scroll box under the pointer (a tall code block, an expanded message) would take this wheel
 * movement itself. Those keep their own speed: only the chat's own scrolling is sped up or slowed down.
 */
export function isTakenByNestedScroller(target: EventTarget | null, container: HTMLElement, deltaY: number): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== container) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (deltaY < 0 ? !atTop : !atBottom) return true;
    }
    el = el.parentElement;
  }
  return false;
}
