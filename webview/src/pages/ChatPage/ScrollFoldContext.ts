import { createContext, useContext } from 'react';

export interface ScrollFoldValue {
  /** Raw folded height. Runs past its bounds in both directions on purpose. */
  height: number;
  /** The bubble's height as it pinned — the fold can never exceed this. */
  restingHeight: number;
}

/**
 * The fold a pinned send hands to the bubble inside it.
 *
 * A context rather than a prop because `MessageBubble` sits in between and is
 * memoised: routing a per-frame number through it would re-render every
 * renderer it can produce, for a value only the user bubble reads. Consumers
 * subscribe directly, so nothing between the two re-renders at all.
 *
 * `null` means "not pinned" — the bubble is at rest and sizes itself.
 */
export const ScrollFoldContext = createContext<ScrollFoldValue | null>(null);

export function useScrollFoldValue(): ScrollFoldValue | null {
  return useContext(ScrollFoldContext);
}
