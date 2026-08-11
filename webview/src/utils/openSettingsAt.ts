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
 * are unavailable. So the open mode is read from {@link setCurrentSettings}, a
 * module-scope mirror of SettingsContext's live `settings` value (kept in sync
 * by the provider on every render — load, backend push, or local edit), and
 * the overlay is requested via a window event that
 * {@link useSettingsOverlayNavigation} turns into a real route transition.
 *
 * This deliberately does NOT read SettingsContext's localStorage cache: that
 * cache is written only on local edits (see SettingsContext's
 * writeLocalStorageSettings call sites), so it goes stale whenever settings
 * change through any other path (initial backend load, SETTINGS_CHANGED
 * push). In JetBrains each editor tab is its own JCEF browser with its own
 * localStorage, so a tab that never itself changed a setting would keep
 * reading a stale cached mode forever (issue #280). The module variable below
 * has no such gap because it mirrors the same `settings` the UI renders from.
 */

/** Window event asking the app shell to open settings as an overlay. */
export const OPEN_SETTINGS_OVERLAY_EVENT = 'open-settings-overlay';

export interface OpenSettingsOverlayDetail {
  /** Which settings page to show. */
  route: Route;
}

/**
 * Module-scope mirror of SettingsContext's `settings` value, kept in sync by
 * the provider (see SettingsContext.tsx) so this file can read the real
 * settings source outside React without becoming a hook. `undefined` before
 * the provider mounts or before the first settings load resolves.
 */
let currentSettings: SettingsState | undefined;

/**
 * Called by SettingsContext whenever its `settings` value changes (initial
 * load, backend SETTINGS_CHANGED push, or a local edit). Do not call this
 * from anywhere else — it exists solely to keep this module's mirror in sync
 * with the one source of truth SettingsContext already computes.
 */
export function setCurrentSettings(settings: SettingsState): void {
  currentSettings = settings;
}

/**
 * Resolve the user's open-mode preference without React. Falls back to the
 * default when the mirror hasn't been populated yet (boot, before the first
 * settings load resolves) — a preference lookup must never block navigation.
 */
function resolveOpenMode(): OpenSettingsMode {
  return currentSettings?.[SettingKey.OPEN_SETTINGS_AS] ?? DEFAULT_SETTINGS[SettingKey.OPEN_SETTINGS_AS];
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
