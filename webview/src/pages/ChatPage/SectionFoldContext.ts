import { createContext, useContext } from 'react';

/**
 * Which send sections have had their reply collapsed, and how to toggle one.
 *
 * A send section is one user send together with everything the CLI produced in
 * reply to it (see `groupIntoSendSections`), so collapsing a section hides that
 * whole reply and leaves the send itself standing. Scrolling back through a
 * session of long replies then becomes scrolling through a list of the prompts
 * that produced them (issue #368).
 *
 * Keyed by `SendSection.key`, which is the head send's uuid. A uuid identifies
 * the same entry across re-renders and across pages loaded later, so a section
 * collapsed before "load older messages" is still the collapsed one afterwards
 * — an index would have silently shifted onto a different send.
 *
 * Deliberately NOT persisted. The state is a reading aid for the session you
 * are looking at right now; writing it to disk would mean a user who collapsed
 * something months ago reopens the session to a reply that appears to be
 * missing, with no memory of having hidden it.
 *
 * This is a context rather than props threaded down because the menu that
 * toggles a section sits inside `UserMessageRenderer`, several memoised layers
 * below the list that has to react to the toggle.
 */
export interface SectionFoldValue {
  /** True while this section's reply is hidden. */
  isCollapsed: (key: string) => boolean;
  /** Flips one section between hidden and shown. */
  toggle: (key: string) => void;
}

export const SectionFoldContext = createContext<SectionFoldValue | null>(null);

/**
 * `null` when no provider is above — the renderers are used in tests and in
 * surfaces that have no notion of sections, and neither should have to install
 * a provider just to draw a bubble. Callers hide the collapse control instead.
 */
export function useSectionFoldValue(): SectionFoldValue | null {
  return useContext(SectionFoldContext);
}

/**
 * The key of the section the subtree belongs to, or `null` for a bubble that
 * heads no section.
 *
 * Separate from the value above because the two have different shapes in time:
 * the fold state is one object for the whole transcript, while the key differs
 * per section. Kept out of props because `MessageBubble` sits between the list
 * and the renderer and is memoised — a prop would have to be threaded through
 * it, re-rendering every kind of bubble it can produce for a value only the
 * user bubble reads.
 *
 * `null` is the common case, not an error: every tool result is a `type: "user"`
 * entry too and reaches the same renderer, and none of those head a section. A
 * bubble that heads nothing has no reply of its own to collapse, so it draws no
 * menu.
 */
export const SectionKeyContext = createContext<string | null>(null);

export function useSectionKey(): string | null {
  return useContext(SectionKeyContext);
}
