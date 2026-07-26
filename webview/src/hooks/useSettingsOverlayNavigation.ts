import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRouter } from '@/router';
import {
  OPEN_SETTINGS_OVERLAY_EVENT,
  type OpenSettingsOverlayDetail,
} from '@/utils/openSettingsAt';

/**
 * Turns {@link OPEN_SETTINGS_OVERLAY_EVENT} into a real route transition.
 *
 * `openSettingsAt()` is hook-free by design (its callers — a toast action, a
 * command-palette item, a keyboard shortcut — run outside React), so it can only
 * ASK for the overlay by emitting an event. This hook is the other half: mounted
 * once at the app shell, it listens and performs the navigation with the current
 * location as `backgroundLocation`, which is what makes SettingsPage render as a
 * modal over the running session instead of replacing it.
 */
export function useSettingsOverlayNavigation(): void {
  const { navigate } = useRouter();
  const location = useLocation();

  useEffect(() => {
    const handler = (e: Event) => {
      const { route } = (e as CustomEvent<OpenSettingsOverlayDetail>).detail;
      // Keep whatever background is already in play: when settings are opened
      // from an existing overlay, reusing that background prevents stacking a
      // second scrim over the first.
      const background = location.state?.backgroundLocation ?? location;
      navigate(route, { backgroundLocation: background });
    };
    window.addEventListener(OPEN_SETTINGS_OVERLAY_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_OVERLAY_EVENT, handler);
  }, [navigate, location]);
}
