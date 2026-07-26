import { getAdapter } from '@/adapters';
import { Route } from '@/router';
import { DEFAULT_SETTINGS, OpenSettingsMode, SettingKey, type SettingsState } from '@/types/settings';

/**
 * Opens a settings page at a specific target, honouring the user's
 * "Open Settings as" preference (General → overlay vs new tab).
 *
 * Use this for EVERY programmatic jump into settings — a sponsor invite, a
 * "configure this" link, a command-palette entry. Opening a tab unconditionally
 * ignores a preference the user explicitly set, and hardcoding the destination
 * strands them on the landing page instead of the section they asked for.
 *
 * Deliberately hook-free: the most common callers (a toast action, a command
 * palette item, a keyboard shortcut) run OUTSIDE React rendering, where hooks
 * are unavailable. So the open mode is read from the settings cache in
 * localStorage, and the overlay is requested via a window event that
 * {@link useSettingsOverlayNavigation} turns into a real route transition.
 */

/** Window event asking the app shell to open settings as an overlay. */
export const OPEN_SETTINGS_OVERLAY_EVENT = 'open-settings-overlay';

export interface OpenSettingsOverlayDetail {
  /** Which settings page to show. */
  route: Route;
}

/**
 * Mirrors SettingsContext's localStorage cache key. Reading the cache (rather
 * than the bridge) keeps this synchronous and usable outside React; the value is
 * written on every settings load/change, so it is the same value the UI shows.
 */
const SETTINGS_STORAGE_KEY = 'claude-code-settings';

/**
 * Resolve the user's open-mode preference without React. Any failure (no cache
 * yet, corrupted JSON, storage disabled) falls back to the default rather than
 * throwing — a preference lookup must never block the navigation itself.
 */
function resolveOpenMode(): OpenSettingsMode {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SettingsState>;
      const mode = parsed[SettingKey.OPEN_SETTINGS_AS];
      if (mode === OpenSettingsMode.OVERLAY || mode === OpenSettingsMode.NEW_TAB) return mode;
    }
  } catch {
    /* unreadable cache → fall through to the default */
  }
  return DEFAULT_SETTINGS[SettingKey.OPEN_SETTINGS_AS];
}

function requestOverlay(route: Route): void {
  window.dispatchEvent(
    new CustomEvent<OpenSettingsOverlayDetail>(OPEN_SETTINGS_OVERLAY_EVENT, {
      detail: { route },
    }),
  );
}

/**
 * Open `route` following the user's preference.
 *
 * @param route a settings route (e.g. `Route.SETTINGS_SPONSOR`)
 */
export async function openSettingsAt(route: Route): Promise<void> {
  if (resolveOpenMode() === OpenSettingsMode.NEW_TAB) {
    try {
      await getAdapter().openSettings(route);
      return;
    } catch (err) {
      // A blocked pop-up (browser) or an unavailable IDE bridge must not swallow
      // the user's click — fall back to the overlay so they still get there.
      console.warn('[openSettingsAt] tab open failed, falling back to overlay:', err);
    }
  }
  requestOverlay(route);
}
