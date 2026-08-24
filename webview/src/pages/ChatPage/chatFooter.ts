import { useEffect, useState } from 'react';

/**
 * The strip at the bottom of the chat — the composer, or whichever panel has
 * replaced it while a question is open (approval, plan, AskUserQuestion).
 *
 * Named because a collapsed review has to sit above it and cannot see it from
 * where it is drawn: the review lives in a portal, so there is no layout
 * relationship to lean on and no shared parent to ask.
 */
export const CHAT_FOOTER_ID = 'chat-footer';

/**
 * How tall that strip is right now, in pixels, or 0 when there is none.
 *
 * Measured rather than assumed because it is not one height: the composer is a
 * line, an approval prompt with three options and a text box is many, and the
 * prompt grows as the user types into it.
 */
export function useChatFooterHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const footer = document.getElementById(CHAT_FOOTER_ID);
    if (!footer) {
      setHeight(0);
      return;
    }

    // Follows the element rather than sampling it once: the panel that occupies
    // this strip changes as the turn goes on, and a stale height would leave the
    // review either overlapping it or floating above nothing.
    const observer = new ResizeObserver(() => {
      setHeight(footer.getBoundingClientRect().height);
    });
    observer.observe(footer);
    setHeight(footer.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  return height;
}
