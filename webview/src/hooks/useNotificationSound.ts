import { useCallback, useEffect } from 'react';
import { SOUND_OFF, type SoundSelection } from '@/notifications';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';

/**
 * Where the notification sound used to be kept: one value per browser origin,
 * read once per screen at mount.
 *
 * It is read exactly once more, to carry an existing choice into the plugin
 * settings file, and then removed. See {@link useNotificationSoundMigration}.
 */
export const LEGACY_NOTIFICATION_SOUND_STORAGE_KEY = 'claude-code-gui:notification-sound';

/**
 * A value the very first version of this setting wrote, asking the browser to
 * use its own default notification sound. It never named a real backend
 * `soundId`, so it cannot be carried anywhere — it reads as "no sound", and the
 * user picks again from the list.
 */
const LEGACY_OS_DEFAULT = 'os_default';

/**
 * The saved sound as the settings dropdown wants to show it: a `soundId`, or
 * the Off sentinel when nothing is saved.
 */
function toSelection(stored: string | null): SoundSelection {
  if (stored === null || stored.trim() === '') return SOUND_OFF;
  return stored;
}

/** The dropdown's value as the settings file wants to store it. */
function toStored(selection: SoundSelection): string | null {
  return selection === SOUND_OFF ? null : selection;
}

interface UseNotificationSoundReturn {
  selection: SoundSelection;
  setSelection: (selection: SoundSelection) => void;
}

/**
 * The notification-sound preference, for the settings row that edits it.
 *
 * The value lives in the plugin settings file (`notificationSound`), so it is
 * the same value for every screen and it survives a restart — including in the
 * JetBrains webview, whose origin changes on every launch and therefore threw
 * away the old per-browser copy each time the IDE was reopened.
 *
 * Nothing outside the settings row reads this. The screens that ring the sound
 * do not need to know its name, because the backend looks it up when it plays
 * it; that is what stopped the chat screen underneath the settings overlay from
 * ringing a sound the user had already replaced.
 */
export function useNotificationSound(): UseNotificationSoundReturn {
  const { settings, updateSetting } = useSettings();
  const stored = settings[SettingKey.NOTIFICATION_SOUND] ?? null;
  const selection = toSelection(stored);

  const setSelection = useCallback(
    (next: SoundSelection) => {
      void updateSetting(SettingKey.NOTIFICATION_SOUND, toStored(next));
    },
    [updateSetting],
  );

  return { selection, setSelection };
}

/**
 * Reads the legacy per-browser value and removes it, whether or not anything
 * was there. Exported for the migration's test; not part of the hook API.
 *
 * Removing it on the way out is what makes the migration happen once: after
 * this, "no legacy value" and "already carried over" are the same state, so a
 * user who later chooses Off is not handed their old sound back on the next
 * launch.
 */
export function takeLegacyNotificationSound(): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY);
    localStorage.removeItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY);
  } catch {
    // Private mode, quota, a disabled store — nothing to carry, and nothing
    // here is worth interrupting the user for.
    return null;
  }
  // `SOUND_OFF` is the dropdown's word for "no sound", and the old store kept
  // it verbatim. Carrying it across as a soundId would save a sound that does
  // not exist and make every turn log "Unknown sound id: off".
  if (raw === null || raw.trim() === '' || raw === SOUND_OFF || raw === LEGACY_OS_DEFAULT) {
    return null;
  }
  return raw;
}

/**
 * Carries a sound chosen before this setting moved into the plugin settings
 * file, once, at startup.
 *
 * Called from the app shell rather than from the settings row, because a user
 * who never opens settings must not lose the sound they already picked.
 *
 * It waits for the settings to actually arrive, and writes only when nothing is
 * saved yet, so it can never overwrite a newer choice with an older one. Every
 * failure is silent: a sound that fails to carry over costs the user one trip
 * to the settings row, and is not worth blocking anything for.
 */
export function useNotificationSoundMigration(): void {
  const { settings, updateSetting, isLoading } = useSettings();
  const saved = settings[SettingKey.NOTIFICATION_SOUND] ?? null;

  useEffect(() => {
    if (isLoading) return;
    if (saved !== null) {
      // Already answered — drop the stale legacy value so it cannot come back.
      takeLegacyNotificationSound();
      return;
    }
    const legacy = takeLegacyNotificationSound();
    if (legacy === null) return;
    void updateSetting(SettingKey.NOTIFICATION_SOUND, legacy).catch(() => {
      // Left alone deliberately: the legacy key is already gone, and retrying
      // on the next render would be a write loop against a backend that just
      // refused one.
    });
  }, [isLoading, saved, updateSetting]);
}
