import { useEffect, useRef } from 'react';

/**
 * Messages written while a permission card holds the running turn are kept in the view (never in the backend queue)
 * because the CLI cannot read them until the card is answered. When the card is answered they all go out at once, in
 * the order they were written, as ordinary messages: the turn goes on after the answer and reads them, as the desktop
 * app does.
 *
 * The answer buttons release them first (see ChatPage), so the CLI has them before it goes on; this is for a card that
 * goes away without being answered here (withdrawn, answered in another window).
 *
 * `waiting` stays true across one card replacing another, so nothing is sent between two cards.
 */
export function useReleaseHeldMessages(waiting: boolean, release: () => void | Promise<void>): void {
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (wasWaiting.current && !waiting) release();
    wasWaiting.current = waiting;
  }, [waiting, release]);
}
