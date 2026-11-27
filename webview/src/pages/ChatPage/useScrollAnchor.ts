import { useCallback, useRef, type RefObject } from 'react';
import { rectMetrics } from '@/utils/zoomRects';

/** The attribute a drawn entry carries so the scroll position can be held on it. */
export const ENTRY_UUID_ATTRIBUTE = 'data-entry-uuid';

/** The props that mark an element as the drawing of the entry with this uuid; none for an entry without one. */
export function entryMarker(uuid: string | null | undefined): Record<string, string> {
  return typeof uuid === 'string' ? { [ENTRY_UUID_ATTRIBUTE]: uuid } : {};
}

/**
 * Put on whatever stays on the screen while the rest scrolls (a send pinned to the top): where an entry inside it
 * is drawn says nothing about where the reader is.
 */
export const SCROLL_UNANCHORED_ATTRIBUTE = 'data-scroll-unanchored';

interface Anchor {
  uuid: string;
  /** The element that drew it, which tells two drawings of one entry apart for as long as it stays. */
  node: HTMLElement;
  /** How far below the top of the scroll container the entry's top edge was, as a rectangle reports it. */
  offset: number;
  /** Where it comes in the order of holding: see `holdRank`. */
  rank: number;
}

/** How many entries from the first one in view are noted, so that one that is no longer drawn has a stand-in. */
const NOTED_ENTRIES = 5;

/**
 * The order in which noted entries are held: what begins on the screen, then what the top edge cuts through, then
 * what is below the screen. The cut one can grow inside when a page lands, which would push everything the reader
 * sees below it down (#708). Last comes what is past the stretch the window holds nothing of, when the screen begins
 * before it: filling the stretch moves all of that.
 */
function holdRank(offset: number, screenHeight: number, pastGap: boolean): number {
  if (pastGap) return 3;
  if (offset < -1) return 1;
  return offset < screenHeight ? 0 : 2;
}

/**
 * Keep the reader's place when entries are added or taken away above it (#680).
 *
 * The transcript window puts pages in front of what is held (an older page) and
 * lets go of entries at the top (a trim), and both move everything the reader is
 * looking at. The place to hold is one entry: the first one that begins on the
 * screen, or, when none does, the one filling it. Its distance from the top edge
 * is noted while the screen is as the reader left it (`capture`), and once the
 * new entries are drawn (`restore`) the scroll position is moved by however far
 * that entry has moved.
 *
 * The entries around it are noted too, because it can stop being drawn: a page of
 * the window can begin with a tool result whose call is on the page before it,
 * and when that page arrives the result is folded into its call (#747).
 *
 * One entry can be drawn in two places (a report of the app's written into the
 * entry of the user's send), so what is held is the element that was noted, and
 * the uuid only finds it again when that element was drawn anew (#708).
 *
 * Holding an entry rather than adding up heights is what makes taking entries
 * away work too: nothing has to know how tall what was dropped had been.
 */
export function useScrollAnchor(
  scrollRef: RefObject<HTMLElement | null>,
  /**
   * Which entries may be held on. What is drawn includes entries made out of others (a restored queued
   * message, say) whose uuid is not an entry's and that several drawn blocks can share: holding on one of
   * those would put the reader at whichever block comes first when the screen is rebuilt.
   */
  isAnchorable: (uuid: string) => boolean = () => true,
) {
  const anchorsRef = useRef<Anchor[]>([]);

  /** Note the first entries in view, each with its offset from the top of the container, best to hold first. */
  const capture = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const { top: containerTop, bottom: containerBottom } = container.getBoundingClientRect();
    const nodes = container.querySelectorAll<HTMLElement>(`[${ENTRY_UUID_ATTRIBUTE}]`);
    const screenHeight = containerBottom - containerTop;
    const gap = container.querySelector('[data-window-gap]');
    const isPast = (node: Node) => !!gap && !!(gap.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const anchors: Anchor[] = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= containerTop + 1) continue;
      // An entry that draws nothing still has its marker, and where that stands says nothing about what is read.
      if (rect.bottom <= rect.top) continue;
      if (node.closest(`[${SCROLL_UNANCHORED_ATTRIBUTE}]`)) continue;
      const uuid = node.getAttribute(ENTRY_UUID_ATTRIBUTE);
      if (!uuid || !isAnchorable(uuid)) continue;
      const offset = rect.top - containerTop;
      // Past the stretch only counts against an entry when the first one noted is before it.
      const pastGap = isPast(node) && anchors.length > 0 && !isPast(anchors[0].node);
      anchors.push({ uuid, node, offset, rank: holdRank(offset, screenHeight, pastGap) });
      if (anchors.length === NOTED_ENTRIES) break;
    }
    // The sort keeps the order of the transcript among the entries of one rank.
    anchorsRef.current = anchors.sort((a, b) => a.rank - b.rank);
  }, [scrollRef, isAnchorable]);

  /** Move the scroll position so a noted entry is where it was. False when none of them can be told on the screen. */
  const restore = useCallback((): boolean => {
    const container = scrollRef.current;
    if (!container) return false;
    const drawn = Array.from(container.querySelectorAll<HTMLElement>(`[${ENTRY_UUID_ATTRIBUTE}]`));
    for (const anchor of anchorsRef.current) {
      const matches = drawn.filter(node => node.getAttribute(ENTRY_UUID_ATTRIBUTE) === anchor.uuid);
      // The element itself, or the only drawing of its entry. Gone, or drawn anew more than once: there is no
      // telling which one the reader was looking at.
      const held = matches.includes(anchor.node) ? anchor.node : matches.length === 1 ? matches[0] : undefined;
      if (!held) continue;
      const rect = held.getBoundingClientRect();
      if (rect.bottom <= rect.top) continue;
      const moved = rect.top - container.getBoundingClientRect().top - anchor.offset;
      // Rectangles are not in the pixels `scrollTop` is in under the UI zoom (see zoomRects).
      if (moved !== 0) container.scrollTop += rectMetrics().toFixed(moved);
      return true;
    }
    return false;
  }, [scrollRef]);

  /** Drop the noted entries: what they described is not on screen any more (a session switch). */
  const forget = useCallback(() => {
    anchorsRef.current = [];
  }, []);

  return { capture, restore, forget };
}
