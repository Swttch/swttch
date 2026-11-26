import { rectMetrics } from '@/utils/zoomRects';

/**
 * Breathing room a jump leaves above the send it lands on, measured from the
 * inner edge of the scroll container's top padding.
 *
 * Landing flush against the edge cuts the previous reply off mid-line right
 * above the message, which reads as being snapped to a boundary rather than
 * arriving somewhere.
 *
 * Applied as an inline `scrollMarginTop` rather than Tailwind's `scroll-mt-16`
 * so this number exists once, in a place the reading line below can be built
 * from. As a class it was a value only the stylesheet knew, and a value outside
 * Tailwind's scale silently emits no CSS at all.
 */
export const SEND_JUMP_SCROLL_MARGIN = 64;

/**
 * The line that decides which send the reader is on, measured down from the
 * scroll container's top.
 *
 * This is NOT the line that decides whether a send is pinned, and the two must
 * not be merged. They answer different questions:
 *
 *  - pinned (the top inset): has this send's header stuck to the top edge?
 *  - reading (here): is this the send the reader is currently on?
 *
 * Built from the landing position on purpose. A jump parks the send this far
 * down (`topInset + SEND_JUMP_SCROLL_MARGIN`), so a reading line at the
 * pinned inset would leave the send you just jumped to counted as NOT being
 * read — the marker would sit on its predecessor, "next" would walk back onto
 * the send you just left, and "previous" would skip two at a time.
 *
 * The extra 8px puts the line just past the landing position, so arriving is
 * enough to be counted as reading rather than depending on the scroll settling
 * exactly.
 *
 * `topInset` is the space the top bar takes (`useTopBar`), so the line moves up
 * with the pinned edge when the bar is hidden instead of staying 40px low.
 */
export function readingLineInset(topInset: number): number {
  return topInset + SEND_JUMP_SCROLL_MARGIN + 8;
}

/**
 * How a jump lands on a send.
 *
 * Two controls now perform the same move: the button on a pinned send that
 * scrolls back to where it actually sits, and a tick in the send index. They
 * share these options rather than each passing their own, because a jump that
 * lands one way from the header and another way from the rail is one action
 * wearing two behaviours.
 *
 * `block: 'start'` puts the send at the top edge; the breathing room above it
 * comes from the sentinel's own scroll margin, not from here — see
 * SEND_JUMP_SCROLL_MARGIN. Letting the browser do the scrolling is also what
 * honours a reduced-motion preference without us reimplementing it.
 */
export const SEND_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'start',
};

/** How many screens away a send may be for the jump to glide to it. */
const GLIDE_SCREENS = 2;

/**
 * Move the chat to a send, given its sentinel.
 *
 * A short way is glided. A long one is gone at once, and so is the way to a send that has just been loaded for
 * (`arriving`): while a glide is on its way, the pages it passes are loaded and let go of, the reader's place is
 * held through each of those by writing the scroll position, and the first such write ends the glide. The jump
 * then stopped wherever it had got to, and the send it was going to was let go of (#747).
 */
export function scrollSendIntoView(sentinel: HTMLElement, arriving = false): void {
  const scroller = sentinel.closest<HTMLElement>('[data-chat-scroll]');
  let atOnce = arriving;
  if (!atOnce && scroller) {
    const distance = Math.abs(sentinel.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
    atOnce = distance > rectMetrics().fromLayout(scroller.clientHeight * GLIDE_SCREENS);
  }
  if (!atOnce) {
    letGo?.();
    sentinel.scrollIntoView(SEND_SCROLL_OPTIONS);
    return;
  }
  holdOn(sentinel);
}

/** How long a send that was gone to at once is held where it was put. */
const HOLD_MS = 800;
/** What the reader does to take the page over again. */
const READER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** Lets go of the send being held, when there is one. */
let letGo: (() => void) | null = null;

/**
 * Put the chat on a send and hold it there while what came near for the first time settles: a code block holds a
 * stand-in height until it is drawn, and pages loaded around the send arrive over the next moments, and either moves
 * the send from where it was put. The reader touching the page ends it at once.
 */
function holdOn(sentinel: HTMLElement): void {
  letGo?.();
  let frame = 0;
  let top = 0;
  const land = () => {
    sentinel.scrollIntoView({ ...SEND_SCROLL_OPTIONS, behavior: 'instant' });
    top = sentinel.getBoundingClientRect().top;
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const event of READER_EVENTS) window.removeEventListener(event, stop, true);
    if (letGo === stop) letGo = null;
  };
  const until = performance.now() + HOLD_MS;
  const watch = () => {
    if (!sentinel.isConnected || performance.now() > until) return stop();
    if (Math.abs(sentinel.getBoundingClientRect().top - top) > 1) land();
    frame = requestAnimationFrame(watch);
  };
  land();
  for (const event of READER_EVENTS) window.addEventListener(event, stop, true);
  frame = requestAnimationFrame(watch);
  letGo = stop;
}

/**
 * Scroll the transcript to the send that opens the given section.
 *
 * Targets the zero-height sentinel rather than the sticky header itself. A
 * sticky element reports the position it is pinned at, not the position it
 * belongs to, so scrolling to it while it is pinned would land on the viewport
 * edge it is already stuck to and move nothing.
 *
 * Returns whether a target was found, so a caller that jumped to a send which
 * is not in the transcript yet can tell the difference between "done" and
 * "still needs loading".
 *
 * `releaseFollow` stops the chat following the bottom before the jump starts
 * (see `ChatFollowContext`); it is left alone when there is nothing to jump to.
 */
export function scrollToSend(sectionKey: string, releaseFollow?: (() => void) | null, arriving = false): boolean {
  const sentinel = document.querySelector<HTMLElement>(
    `[data-send-section="${CSS.escape(sectionKey)}"] [data-send-sentinel]`,
  );
  if (!sentinel) return false;
  releaseFollow?.();
  scrollSendIntoView(sentinel, arriving);
  return true;
}
