/**
 * The plugin version whose release notes the user has already been shown.
 *
 * Kept in localStorage next to the inline-announcement dismissals
 * (`Announcements/inline/dismissed.ts`), because "what's new" is a client-side
 * decision: the backend has no per-user record to write it to, and the modal
 * must stay closed on every later launch of the same version.
 *
 * Reading it is subscribable rather than one-shot — the component that marks a
 * version as seen and the component that decides whether to open the modal are
 * the same one, so without a notification React would keep the stale value and
 * re-open the modal on the next render pass.
 */
const KEY = 'claude-code-gui:whats-new-last-seen-version';

const listeners = new Set<() => void>();

export function readLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private mode or a blocked store. Reporting "nothing seen yet" would open
    // the modal on every single launch, which is worse than never opening it,
    // so an unreadable store counts as already seen.
    return UNREADABLE;
  }
}

/**
 * Returned when localStorage cannot be read at all. It is not a real version,
 * so it never equals `pluginVersion` — `shouldShowWhatsNew` treats it as a
 * separate case rather than comparing it.
 */
export const UNREADABLE = '<unreadable>';

export function markVersionSeen(version: string): void {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    // Quota or privacy mode: the listeners still fire, so the modal closes for
    // this session even though it cannot be remembered for the next one.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLastSeenVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the "what's new" modal should open for this launch.
 *
 * The modal is for users who just updated, so a first-ever launch (nothing
 * recorded) does not qualify: showing 79 pages of history to someone who has
 * never run the plugin is an onboarding wall, not a changelog. That first
 * launch only records the version, and the modal starts appearing from the
 * next update onward.
 */
export function shouldShowWhatsNew(
  pluginVersion: string | null | undefined,
  lastSeen: string | null,
): boolean {
  if (!pluginVersion || pluginVersion === 'unknown' || pluginVersion === '...') return false;
  if (lastSeen === UNREADABLE) return false;
  if (lastSeen === null) return false; // first ever launch: record only
  return lastSeen !== pluginVersion;
}
