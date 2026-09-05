import { useSyncExternalStore } from 'react';

/**
 * "Don't show me this again" for inline announcements, kept in localStorage.
 *
 * Server-driven announcements record dismissal through the backend, but an
 * inline one is built into the app and has no server record to write to — this
 * is its equivalent.
 *
 * Subscribable rather than read once, because the thing that dismisses an
 * announcement and the thing that decides whether to show it are different
 * components: without a notification the list would keep offering an
 * announcement that had just been closed.
 */
const KEY_PREFIX = 'claude-code-gui:inline-announcement-dismissed:';

const listeners = new Set<() => void>();

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readInlineDismissed(id: string): boolean {
  try {
    return localStorage.getItem(keyFor(id)) === '1';
  } catch {
    // Private mode or a blocked store: nothing was dismissed as far as we know.
    return false;
  }
}

export function dismissInline(id: string): void {
  try {
    localStorage.setItem(keyFor(id), '1');
  } catch {
    // Quota or privacy mode. The listeners still fire so it goes away for this
    // session, which is the part the user asked for.
  }
  listeners.forEach((listener) => listener());
}

/** Whether this inline announcement has been dismissed, re-read when that changes. */
export function useInlineDismissed(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readInlineDismissed(id),
    () => false,
  );
}
