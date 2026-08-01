import { useCallback, useMemo } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, type DockLayout } from '@/types/settings';
import { normalizeDockLayout } from './normalizeDockLayout';

/**
 * The header dock arrangement, repaired for rendering and saved back globally.
 *
 * Reads always go through {@link normalizeDockLayout}, so callers never have to
 * handle a missing key, an id from another build, or a duplicate.
 *
 * Writes go to GLOBAL scope explicitly. `updateSetting` would follow the settings
 * screen's currently selected scope tab, which would quietly write the dock into
 * a project file whenever the user happened to be viewing that tab — the dock is
 * a toolbar navigated by muscle memory and must not change between projects.
 */
export function useDockLayout() {
  const { settings, updateSettingWithScope } = useSettings();

  const layout = useMemo(
    () => normalizeDockLayout(settings[SettingKey.DOCK_LAYOUT]),
    [settings],
  );

  const save = useCallback(
    (next: DockLayout) => {
      // Normalize before persisting too: the file is the thing a user may edit by
      // hand, so it should never be the source of a duplicate or unknown id.
      void updateSettingWithScope(SettingKey.DOCK_LAYOUT, normalizeDockLayout(next), 'global');
    },
    [updateSettingWithScope],
  );

  return { layout, save };
}
