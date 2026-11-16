import { useCallback, useRef, type RefObject } from 'react';

/** The attribute a drawn entry carries so the scroll position can be held on it. */
export const ENTRY_UUID_ATTRIBUTE = 'data-entry-uuid';

/** The props that mark an element as the drawing of the entry with this uuid; none for an entry without one. */
export function entryMarker(uuid: string | null | undefined): Record<string, string> {
  return typeof uuid === 'string' ? { [ENTRY_UUID_ATTRIBUTE]: uuid } : {};
}

interface Anchor {
  uuid: string;
  /** How far below the top of the scroll container the entry's top edge was. */
  offset: number;
}

/**
 * Keep the reader's place when entries are added or taken away above it (#680).
 *
 * The transcript window puts pages in front of what is held (an older page) and
 * lets go of entries at the top (a trim), and both move everything the reader is
 * looking at. The place to hold is one entry: the first one still in view. Its
 * distance from the top edge is noted while the screen is as the reader left it
 * (`capture`), and once the new entries are drawn (`restore`) the scroll position
 * is moved by however far that entry has moved.
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
  const anchorRef = useRef<Anchor | null>(null);

  /** Note the first entry in view, with its offset from the top of the container. */
  const capture = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const nodes = container.querySelectorAll<HTMLElement>(`[${ENTRY_UUID_ATTRIBUTE}]`);
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= containerTop + 1) continue;
      const uuid = node.getAttribute(ENTRY_UUID_ATTRIBUTE);
      if (!uuid || !isAnchorable(uuid)) continue;
      anchorRef.current = { uuid, offset: rect.top - containerTop };
      return;
    }
    anchorRef.current = null;
  }, [scrollRef, isAnchorable]);

  /** Move the scroll position so the noted entry is where it was. False when it is not drawn any more. */
  const restore = useCallback((): boolean => {
    const container = scrollRef.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return false;
    const matches = Array.from(container.querySelectorAll<HTMLElement>(`[${ENTRY_UUID_ATTRIBUTE}]`)).filter(
      candidate => candidate.getAttribute(ENTRY_UUID_ATTRIBUTE) === anchor.uuid,
    );
    // Gone, or drawn more than once: there is no telling which one the reader was looking at.
    if (matches.length !== 1) return false;
    const node = matches[0];
    const moved = node.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset;
    if (moved !== 0) container.scrollTop += moved;
    return true;
  }, [scrollRef]);

  /** Drop the noted entry: what it described is not on screen any more (a session switch). */
  const forget = useCallback(() => {
    anchorRef.current = null;
  }, []);

  return { capture, restore, forget };
}
