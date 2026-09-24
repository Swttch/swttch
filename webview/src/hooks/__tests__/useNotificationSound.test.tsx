import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SettingKey, type SettingsState } from '@/types/settings';

// ---------------------------------------------------------------------------
// SettingsContext stands in for the plugin settings file, which is where the
// sound now lives. The stub keeps ONE value for all callers and hands the same
// value to everything that reads it, exactly as the real context does — that
// single copy is the point of the change under test.
// ---------------------------------------------------------------------------

let storedSettings: Partial<SettingsState> = {};
let settingsLoading = false;
const updateSettingMock = vi.fn(async (key: string, value: unknown) => {
  storedSettings = { ...storedSettings, [key]: value };
});

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: storedSettings,
    isLoading: settingsLoading,
    updateSetting: updateSettingMock,
  }),
}));

import {
  useNotificationSound,
  useNotificationSoundMigration,
  takeLegacyNotificationSound,
  LEGACY_NOTIFICATION_SOUND_STORAGE_KEY,
} from '../useNotificationSound';
import { SOUND_OFF } from '@/notifications';

function clearStorage() {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
}

beforeEach(() => {
  clearStorage();
  storedSettings = {};
  settingsLoading = false;
  updateSettingMock.mockClear();
});

afterEach(() => {
  clearStorage();
});

describe('useNotificationSound', () => {
  it('shows Off when the settings file names no sound', () => {
    const { result } = renderHook(() => useNotificationSound());
    expect(result.current.selection).toBe(SOUND_OFF);
  });

  it('shows the sound the settings file names', () => {
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Glass' };
    const { result } = renderHook(() => useNotificationSound());
    expect(result.current.selection).toBe('Glass');
  });

  it('shows Off for a blank saved value', () => {
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: '   ' };
    const { result } = renderHook(() => useNotificationSound());
    expect(result.current.selection).toBe(SOUND_OFF);
  });

  it('writes the chosen sound into the settings file', () => {
    const { result } = renderHook(() => useNotificationSound());
    act(() => {
      result.current.setSelection('Ping');
    });
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND, 'Ping');
  });

  it('writes null, not the Off sentinel, when the user picks Off', () => {
    // "off" is a row in a dropdown, not a value worth keeping in a file the
    // user reads. The file says null, which is how every other unset setting
    // says the same thing.
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Glass' };
    const { result } = renderHook(() => useNotificationSound());
    act(() => {
      result.current.setSelection(SOUND_OFF);
    });
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND, null);
  });

  /**
   * The reported defect, on the smallest piece that can show it.
   *
   * Two screens are open at once — the settings overlay and the chat screen it
   * is drawn on top of — and neither is unmounted when the user picks a new
   * sound. Back when each screen kept its own copy, the one that was not
   * touched went on reporting the old sound forever, because the only thing
   * that ever synced them was the browser's `storage` event and that event does
   * not fire for the window that made the change.
   */
  it('shows the new sound on a second screen that was never remounted', () => {
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Hero' };

    const settingsScreen = renderHook(() => useNotificationSound());
    const otherScreen = renderHook(() => useNotificationSound());
    expect(otherScreen.result.current.selection).toBe('Hero');

    act(() => {
      settingsScreen.result.current.setSelection('Glass');
    });
    // Nothing is remounted; the other screen is only re-rendered, as a shared
    // store re-render would do in the app.
    otherScreen.rerender();

    expect(otherScreen.result.current.selection).toBe('Glass');
  });
});

describe('takeLegacyNotificationSound', () => {
  it('returns the stored value and removes it', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'Hero');
    expect(takeLegacyNotificationSound()).toBe('Hero');
    expect(localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY)).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(takeLegacyNotificationSound()).toBeNull();
  });

  it('reads the old "off" sentinel as nothing to carry', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, SOUND_OFF);
    // 'off' is not a soundId. Saved as one it would make every turn fail with
    // "Unknown sound id: off".
    expect(takeLegacyNotificationSound()).toBeNull();
  });

  it('reads the first-version "os_default" value as nothing to carry', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'os_default');
    expect(takeLegacyNotificationSound()).toBeNull();
    expect(localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY)).toBeNull();
  });
});

describe('useNotificationSoundMigration', () => {
  it('carries a sound chosen before the setting moved into the settings file', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'Hero');

    renderHook(() => useNotificationSoundMigration());

    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND, 'Hero');
    expect(localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY)).toBeNull();
  });

  it('runs once — a later choice of Off is not undone on the next launch', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'Hero');
    const first = renderHook(() => useNotificationSoundMigration());
    first.unmount();
    updateSettingMock.mockClear();

    // The user then picks Off, and the app is started again.
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: null };
    renderHook(() => useNotificationSoundMigration());

    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('never overwrites a sound already saved in the settings file', () => {
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'Hero');
    storedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Glass' };

    renderHook(() => useNotificationSoundMigration());

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY)).toBeNull();
  });

  it('waits for the settings to arrive before deciding anything', () => {
    // Writing against the not-yet-loaded defaults would look exactly like
    // "nothing saved" and could overwrite a real saved sound.
    localStorage.setItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY, 'Hero');
    settingsLoading = true;

    renderHook(() => useNotificationSoundMigration());

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_NOTIFICATION_SOUND_STORAGE_KEY)).toBe('Hero');
  });

  it('does nothing when there was never a legacy value', () => {
    renderHook(() => useNotificationSoundMigration());
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('does not block the user when the store cannot be read', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });

    expect(() => renderHook(() => useNotificationSoundMigration())).not.toThrow();
    expect(updateSettingMock).not.toHaveBeenCalled();

    getItem.mockRestore();
  });
});
