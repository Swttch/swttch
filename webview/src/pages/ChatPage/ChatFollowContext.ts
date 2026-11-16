import { createContext } from 'react';

/**
 * Stops the chat following the bottom, for a control that is about to move the view away from it.
 *
 * While a reply streams, the chat follows it by writing the scroll position every frame (see `useAutoScroll`,
 * issue #701), and a write of the scroll position cancels a smooth scroll the browser is playing. A jump that
 * starts while following is on would be pulled back by the next line of the reply, so the jump stops the follow
 * first. Null outside the chat page, where nothing follows.
 */
export const ChatFollowContext = createContext<(() => void) | null>(null);
