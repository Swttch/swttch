/**
 * Keeping a log that is cut from the front in place under the reader.
 *
 * The backend sends a background task's log whole on every change, but only
 * its last 200,000 characters (`loadBackgroundTaskOutput`). Once a log is past
 * that, each push adds lines at the bottom and drops as many from the top. The
 * scroll position stays the same number of pixels from the top while the text
 * under it moves up, so a reader scrolled back to something watched it slide
 * away line by line. Measured in Chromium: 200 lines dropped at the top moved
 * the line at the top of the view from "count: 1333" to "count: 1533".
 *
 * Everything here gives up (returns null) rather than guess: no correction at
 * all leaves the view where the browser put it, which is the behaviour from
 * before any of this existed, while a wrong correction would throw the reader
 * somewhere else entirely.
 */

/** How many places in the new text are tried before giving up. */
const MAX_CANDIDATES = 1024;
/** How much of the old text's end is searched for in the new text. */
const PROBE_LENGTH = 64;
/** How much of a candidate is compared before it is compared in full. */
const WINDOW_LENGTH = 4096;
/** How many candidates may be compared in full before giving up. */
const MAX_FULL_COMPARES = 4;

/**
 * How much of `next`'s start was already the end of `prev`, when `next` is
 * `prev` with text cut from its front (and usually more added at its end).
 *
 * Null when nothing was cut (`next` only grew, or is the same), when `next` is
 * unrelated to `prev`, when either is empty, and when no answer was confirmed
 * within MAX_CANDIDATES tries.
 *
 * The search starts from where the old text's end turns up last in the new
 * text, which is where the kept part ends and the added part begins, and walks
 * back from there. A candidate is compared over its first WINDOW_LENGTH
 * characters, and only one that passes that is compared in full; no more than
 * MAX_FULL_COMPARES are. Measured on 200,000-character inputs (see the frontTrim
 * tests), one call stays well under a millisecond, including a log of one line
 * repeated tens of thousands of times.
 *
 * Where the text repeats so that more than one cut fits, the largest kept part
 * is returned: every cut that fits puts the same characters at the same place
 * on screen.
 */
export function frontTrimKeptLength(prev: string, next: string): number | null {
  if (!prev || !next) return null;
  if (next.startsWith(prev)) return null;
  // Two searches, because each one is quick exactly where the other is slow. A
  // log whose newest lines repeat (a progress bar, a heartbeat) makes the end
  // of the old text turn up everywhere, but its oldest kept line is usually
  // unique; and the other way round.
  return searchFromHead(prev, next) ?? searchFromTail(prev, next);
}

type Confirm = (cut: number) => boolean | 'give up';

/** A check of one candidate cut, with its own allowance of full comparisons. */
function confirmer(prev: string, next: string): Confirm {
  let fullCompares = 0;
  return (cut) => {
    const kept = prev.length - cut;
    if (cut <= 0 || kept <= 0 || kept > next.length) return false;
    const window = Math.min(WINDOW_LENGTH, kept);
    if (!next.startsWith(prev.slice(cut, cut + window))) return false;
    if (window === kept) return true;
    if (fullCompares >= MAX_FULL_COMPARES) return 'give up';
    fullCompares += 1;
    return next.startsWith(prev.slice(cut));
  };
}

/** Where the new text's start turns up in the old text, first place first. */
function searchFromHead(prev: string, next: string): number | null {
  const confirm = confirmer(prev, next);
  const head = next.slice(0, PROBE_LENGTH);
  let from = 1;
  for (let tries = 0; tries < MAX_CANDIDATES; tries++) {
    const cut = prev.indexOf(head, from);
    if (cut < 0) return null;
    from = cut + 1;
    const verdict = confirm(cut);
    if (verdict === 'give up') return null;
    if (verdict) return prev.length - cut;
  }
  return null;
}

/** Where the old text's end turns up in the new text, last place first. */
function searchFromTail(prev: string, next: string): number | null {
  const confirm = confirmer(prev, next);
  const tail = prev.slice(-PROBE_LENGTH);
  // A kept part as long as the old text would mean nothing was cut, so the
  // search starts below that.
  let position = Math.min(next.length - tail.length, prev.length - tail.length - 1);
  for (let tries = 0; tries < MAX_CANDIDATES && position >= 0; tries++) {
    const at = next.lastIndexOf(tail, position);
    if (at < 0) return null;
    position = at - 1;
    const kept = at + tail.length;
    const verdict = confirm(prev.length - kept);
    if (verdict === 'give up') return null;
    if (verdict) return kept;
  }
  return null;
}

/** The bottom edge, on screen, of the character at `index` of `root`'s text. */
function charBottom(root: Node, index: number): number | null {
  const doc = root.ownerDocument;
  if (!doc) return null;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (index < seen + length) {
      const range = doc.createRange();
      range.setStart(node, index - seen);
      range.setEnd(node, index - seen + 1);
      if (typeof range.getBoundingClientRect !== 'function') return null;
      const rect = range.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.bottom) || !Number.isFinite(rect.top)) return null;
      // An all-zero box is what an engine hands back when it laid nothing out
      // (a hidden view, a host that does not measure ranges). It is not a
      // position.
      if (rect.top === 0 && rect.bottom === 0 && rect.width === 0 && rect.height === 0) return null;
      return rect.bottom;
    }
    seen += length;
  }
  return null;
}

/**
 * The height taken by `root`'s text after its first `keptLength` characters,
 * measured from the bottom of the last kept line to the bottom of the last
 * line. Null where it cannot be measured (no layout, as under jsdom, or an
 * engine returning empty boxes), and where the measurement makes no sense.
 */
export function heightAfter(root: Node, keptLength: number, totalLength: number): number | null {
  if (keptLength <= 0 || keptLength > totalLength) return null;
  const keptBottom = charBottom(root, keptLength - 1);
  const lastBottom = charBottom(root, totalLength - 1);
  if (keptBottom === null || lastBottom === null) return null;
  const height = lastBottom - keptBottom;
  return Number.isFinite(height) && height >= 0 ? height : null;
}

export interface FrontTrimMeasure {
  /** Scroll position as of the last frame before the new text. */
  prevScrollTop: number;
  /** Content height as of the last frame before the new text. */
  prevScrollHeight: number;
  /** Content height with the new text in. */
  scrollHeight: number;
  clientHeight: number;
  /** What `heightAfter` measured for the text added at the end. */
  appendedHeight: number;
}

/**
 * Where to put the view so the text the reader was on stays where it was:
 * up by the height that left from the top. The content's old height minus its
 * new height without what was added is that height.
 *
 * Null for any input that is not a usable measurement (not finite, an added
 * part taller than the whole, a change bigger than the old content), so a bad
 * measurement leaves the view alone rather than sending it to NaN, Infinity or
 * the top. The result is kept within the scrollable range.
 */
export function frontTrimScrollTop(m: FrontTrimMeasure): number | null {
  const values = [m.prevScrollTop, m.prevScrollHeight, m.scrollHeight, m.clientHeight, m.appendedHeight];
  if (!values.every(Number.isFinite)) return null;
  if (m.appendedHeight < 0 || m.appendedHeight > m.scrollHeight) return null;
  const removed = m.prevScrollHeight - (m.scrollHeight - m.appendedHeight);
  if (Math.abs(removed) > m.prevScrollHeight) return null;
  const max = Math.max(0, m.scrollHeight - m.clientHeight);
  return Math.min(max, Math.max(0, m.prevScrollTop - removed));
}
