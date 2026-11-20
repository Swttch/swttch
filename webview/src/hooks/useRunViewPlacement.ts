import { useCallback } from 'react';
import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { SettingKey, type RunViewPlacement } from '@/types/settings';

/**
 * The place a run opens in that was pinned as the default for this project, or null when none was.
 *
 * Read from the settings the screen already holds, so a pin set in one window shows in the others once the backend has
 * told them. Without a settings provider (a view drawn on its own) there is no pin to read and none to set.
 */
export function useRunViewPlacement(): {
  pinned: RunViewPlacement | null;
  pin: ((placement: RunViewPlacement) => void) | null;
  /** Takes the pin off: no place is the default any more, and a run opens beside the chat. */
  unpin: (() => void) | null;
} {
  const settings = useSettingsOrNull();
  const updateSettingWithScope = settings?.updateSettingWithScope;
  const pinned = settings?.settings[SettingKey.RUN_VIEW_PLACEMENT] ?? null;

  // Kept for the project, not for every project: the project scope.
  const pin = useCallback(
    (placement: RunViewPlacement) => {
      void updateSettingWithScope?.(SettingKey.RUN_VIEW_PLACEMENT, placement, 'project');
    },
    [updateSettingWithScope],
  );

  // A null saved for the project takes the key out of its file (the project scope's reset), so nothing is left pinned.
  const unpin = useCallback(() => {
    void updateSettingWithScope?.(SettingKey.RUN_VIEW_PLACEMENT, null, 'project');
  }, [updateSettingWithScope]);

  return { pinned, pin: updateSettingWithScope ? pin : null, unpin: updateSettingWithScope ? unpin : null };
}
