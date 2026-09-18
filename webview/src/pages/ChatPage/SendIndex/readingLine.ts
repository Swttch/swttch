import { READING_LINE_INSET } from './scrollToSend';

/**
 * Which send the reader is on, read straight off the document.
 *
 * Measured rather than observed. `IntersectionObserver` answers "did this cross
 * the edge", and that is a different question: a sentinel above the reading line
 * and one far below it are BOTH non-intersecting, so the observer cannot tell
 * them apart, and — worse — it does not fire at all when a scroll carries a
 * sentinel from one of those states to the other without stopping in between.
 * Built on it, the marker sat on the bottom send and never moved: measured at
 * scrollTop 0 in a 17-send session, exactly one sentinel was above the line and
 * the rail still pointed at the seventeenth.
 *
 * A binary search keeps the cost of measuring flat. The sentinels are in
 * document order, so their tops are ascending, and the last one above the line
 * is found in about ten reads however long the session is.
 */
export function readingLineSectionKey(): string | null {
  const sentinels = document.querySelectorAll<HTMLElement>('[data-send-sentinel]');
  if (sentinels.length === 0) return null;

  let lo = 0;
  let hi = sentinels.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentinels[mid].getBoundingClientRect().top < READING_LINE_INSET) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Nothing has reached the line: the reader is at the very top of the
  // transcript, above its first send. The rail decides what to mark there.
  if (found === -1) return null;

  return sentinels[found].closest('[data-send-section]')?.getAttribute('data-send-section') ?? null;
}
