export type ProjectSortOrder = 'recent' | 'created';

const STORAGE_KEY = 'claude-code-gui:project-selector:sort-order';

/**
 * The user's chosen sort order, kept in localStorage rather than the backend
 * store that holds pins (#392 item 4).
 *
 * Which order the list reads in is a display preference, not data the user
 * would notice or mind losing on a different browser — unlike a pin, which is
 * a decision about a specific project that should follow the user. A tunnel
 * session opened from a second browser is free to start back at the default.
 */
export function readSortOrder(): ProjectSortOrder {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'created' ? 'created' : 'recent';
  } catch {
    return 'recent';
  }
}

export function persistSortOrder(order: ProjectSortOrder): void {
  try {
    localStorage.setItem(STORAGE_KEY, order);
  } catch {
    // ignore (quota exceeded, privacy mode)
  }
}
