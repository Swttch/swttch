import { createContext } from 'react';

/**
 * Where the clock of a running turn starts, in milliseconds since the epoch, for the lines that count its seconds.
 *
 * Without a provider (`undefined`) the clock is the chat's own: the moment the running turn's message was sent. A view
 * that draws the work of something other than the chat's turn (an agent's own record) gives its own start, or `null`
 * while it has none, so that its lines do not count the chat's seconds.
 */
export const TurnClockContext = createContext<number | null | undefined>(undefined);
