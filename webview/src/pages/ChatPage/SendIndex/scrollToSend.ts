import { PINNED_TOP_INSET } from '../useScrollFold';

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
 *  - pinned (PINNED_TOP_INSET): has this send's header stuck to the top edge?
 *  - reading (here): is this the send the reader is currently on?
 *
 * Built from the landing position on purpose. A jump parks the send this far
 * down (`PINNED_TOP_INSET + SEND_JUMP_SCROLL_MARGIN`), so a reading line at the
 * pinned inset would leave the send you just jumped to counted as NOT being
 * read — the marker would sit on its predecessor, "next" would walk back onto
 * the send you just left, and "previous" would skip two at a time.
 *
 * The extra 8px puts the line just past the landing position, so arriving is
 * enough to be counted as reading rather than depending on the scroll settling
 * exactly.
 */
export const READING_LINE_INSET = PINNED_TOP_INSET + SEND_JUMP_SCROLL_MARGIN + 8;

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
 */
export function scrollToSend(sectionKey: string): boolean {
  const sentinel = document.querySelector<HTMLElement>(
    `[data-send-section="${CSS.escape(sectionKey)}"] [data-send-sentinel]`,
  );
  if (!sentinel) return false;
  sentinel.scrollIntoView(SEND_SCROLL_OPTIONS);
  return true;
}
