/** What the menu is about: the thing right-clicked. */
export type LinkMenuTarget =
  | { kind: 'external'; url: string }
  | { kind: 'file'; path: string; line?: number; column?: number };

/** Where the link menu is open: its target and the pointer's position. */
export interface LinkMenuState {
  target: LinkMenuTarget;
  x: number;
  y: number;
}

let state: LinkMenuState | null = null;
const listeners = new Set<() => void>();

function set(next: LinkMenuState | null): void {
  state = next;
  listeners.forEach((listener) => listener());
}

/**
 * The one link menu the page can show. A right click on a link lives in the
 * document-level listener, outside React, and the menu itself is a component:
 * this is the small shared state between the two.
 */
export const linkMenuStore = {
  get: (): LinkMenuState | null => state,
  open: (next: LinkMenuState): void => set(next),
  close: (): void => set(null),
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
