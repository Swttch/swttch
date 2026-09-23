import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingKey } from '@/types/settings';

// ---------------------------------------------------------------------------
// api.sounds mocking
// ---------------------------------------------------------------------------

const listMock = vi.fn();
const playMock = vi.fn();
// The banner row asks the OS whether our banners linger; 'unknown' is the
// answer off macOS and keeps the hint out of the way of the tests below that
// are about the sound. The volume tests that care set their own.
const persistenceMock = vi.fn().mockResolvedValue('unknown');
const openSettingsMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    sounds: {
      list: (...args: unknown[]) => listMock(...args),
      play: (...args: unknown[]) => playMock(...args),
    },
    notifications: {
      bannerPersistence: () => persistenceMock(),
      openSystemSettings: () => openSettingsMock(),
    },
  },
}));

// ---------------------------------------------------------------------------
// SettingsContext mocking — both rows are plugin settings now. The stub keeps
// one value per key and hands it to every reader, as the real context does.
// ---------------------------------------------------------------------------

let mockSettings: Record<string, unknown> = {};
const settingsListeners = new Set<() => void>();

/** Writes the key and tells every reader, the way the shared cache does. */
const updateSettingMock = vi.fn((key: string, value: unknown) => {
  mockSettings = { ...mockSettings, [key]: value };
  settingsListeners.forEach((notify) => notify());
});

vi.mock('@/contexts/SettingsContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSettingsOrNull: () => null,
    useSettings: () => {
      const settings = useSyncExternalStore(
        (onChange: () => void) => {
          settingsListeners.add(onChange);
          return () => settingsListeners.delete(onChange);
        },
        () => mockSettings,
      );
      return {
        settings,
        scopeSettings: settings,
        isLoading: false,
        updateSetting: updateSettingMock,
        scope: 'global' as const,
      };
    },
  };
});

import { NotificationsSection } from '..';
import { _resetSystemSoundsCache } from '@/notifications/useSystemSounds';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  _resetSystemSoundsCache();
  listMock.mockReset();
  playMock.mockReset();
  playMock.mockResolvedValue(undefined);
  updateSettingMock.mockClear();
  persistenceMock.mockClear();
  persistenceMock.mockResolvedValue('unknown');
  openSettingsMock.mockClear();
  mockSettings = {};
});

const getTrigger = () =>
  screen.getByRole('button', { name: /Notification Sound/i }) as HTMLButtonElement;

const getBannerToggle = () =>
  screen.getByRole('switch', { name: /Banner/i }) as HTMLElement;

const getVolumeSlider = () =>
  screen.getByRole('slider', { name: /^Volume$/i }) as HTMLInputElement;

/** Open the dropdown and return the visible option labels (stripped of the ✓ marker). */
const openAndGetOptionLabels = () => {
  fireEvent.click(getTrigger());
  return screen
    .getAllByRole('option')
    .map((o) => o.textContent?.replace('✓', '').trim());
};

describe('NotificationsSection – sound', () => {
  it('shows a loading hint and disables the trigger while sounds are fetching', () => {
    listMock.mockReturnValueOnce(new Promise(() => {}));
    render(<NotificationsSection />);

    expect(getTrigger().disabled).toBe(true);
    expect(screen.getByText(/loading system sounds/i)).toBeInTheDocument();
  });

  it('renders Off plus the backend-provided sounds after fetch resolves', async () => {
    listMock.mockResolvedValueOnce([
      { id: 'Glass', label: 'Glass' },
      { id: 'Ping', label: 'Ping' },
    ]);

    render(<NotificationsSection />);

    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });
    expect(getTrigger().textContent).toContain('Off');

    expect(openAndGetOptionLabels()).toEqual(['Off', 'Glass', 'Ping']);
  });

  // The sound the settings file names is what the row shows, so a user who
  // already picked one does not find it reset.
  it('reads the persisted selection at mount', async () => {
    mockSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Ping' };
    listMock.mockResolvedValueOnce([
      { id: 'Glass', label: 'Glass' },
      { id: 'Ping', label: 'Ping' },
    ]);

    render(<NotificationsSection />);

    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });
    expect(getTrigger().textContent).toContain('Ping');
  });

  it('writes the new value into the settings file and previews it on change', async () => {
    listMock.mockResolvedValueOnce([
      { id: 'Glass', label: 'Glass' },
      { id: 'Ping', label: 'Ping' },
    ]);

    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });

    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Glass' }));

    expect(getTrigger().textContent).toContain('Glass');
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND, 'Glass');
    // The preview names the sound outright, and should: the user is pointing at
    // a row and asking what it sounds like, not asking what is saved.
    expect(playMock).toHaveBeenCalledTimes(1);
    // Previewed at the saved volume, not at full: a sound auditioned louder
    // than it will ever ring is not the sound being chosen.
    expect(playMock).toHaveBeenCalledWith('Glass', 5);
  });

  it('does NOT preview when the user selects Off', async () => {
    mockSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Glass' };
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);

    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });
    expect(getTrigger().textContent).toContain('Glass');

    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Off' }));

    expect(getTrigger().textContent).toContain('Off');
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND, null);
    expect(playMock).not.toHaveBeenCalled();
  });

  it('shows an empty-state hint when the backend returns no sounds', async () => {
    listMock.mockResolvedValueOnce([]);

    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });

    // Only Off is selectable.
    expect(openAndGetOptionLabels()).toEqual(['Off']);
    expect(screen.getByText(/no system sounds detected/i)).toBeInTheDocument();
  });

  it('shows an error hint and disables the trigger when the fetch fails', async () => {
    listMock.mockRejectedValueOnce(new Error('scan failed'));

    render(<NotificationsSection />);

    await waitFor(() => {
      expect(screen.getByText(/scan failed/i)).toBeInTheDocument();
    });
    expect(getTrigger().disabled).toBe(true);
  });

  it('swallows preview failures without throwing', async () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    playMock.mockRejectedValueOnce(new Error('player crashed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });

    fireEvent.click(getTrigger());
    expect(() =>
      fireEvent.click(screen.getByRole('option', { name: 'Glass' })),
    ).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('describes when the sound runs, and previews on choosing', async () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });
    expect(
      screen.getByText(/finishes its response or stops to wait for your confirmation/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Choosing a sound previews it once/i)).toBeInTheDocument();
  });
});

describe('NotificationsSection – banner', () => {
  it('is on when the setting has never been written', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = {};
    render(<NotificationsSection />);
    expect(getBannerToggle().getAttribute('aria-checked')).toBe('true');
  });

  it('is off only when the stored value is explicitly false', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = { [SettingKey.NOTIFICATION_BANNER]: false };
    render(<NotificationsSection />);
    expect(getBannerToggle().getAttribute('aria-checked')).toBe('false');
  });

  it('writes the new value when toggled', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = { [SettingKey.NOTIFICATION_BANNER]: true };
    render(<NotificationsSection />);

    fireEvent.click(getBannerToggle());

    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_BANNER, false);
  });

  it('does not touch the sound when the banner is switched off', () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    mockSettings = {
      [SettingKey.NOTIFICATION_BANNER]: true,
      [SettingKey.NOTIFICATION_SOUND]: 'Glass',
    };
    render(<NotificationsSection />);

    fireEvent.click(getBannerToggle());

    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_BANNER, false);
    expect(mockSettings[SettingKey.NOTIFICATION_SOUND]).toBe('Glass');
  });
});

describe('NotificationsSection – volume', () => {
  it('starts at the middle step when nothing has been saved', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = {};
    render(<NotificationsSection />);

    expect(getVolumeSlider().value).toBe('5');
  });

  it('runs from 1 to 10 in whole steps', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = {};
    render(<NotificationsSection />);

    const slider = getVolumeSlider();
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('10');
    expect(slider.step).toBe('1');
  });

  it('shows the saved step', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = { [SettingKey.NOTIFICATION_SOUND_VOLUME]: 8 };
    render(<NotificationsSection />);

    expect(getVolumeSlider().value).toBe('8');
  });

  it('clamps a hand-edited value that is out of range', () => {
    listMock.mockResolvedValueOnce([]);
    // A settings file edited by hand can say anything; the control must still
    // land somewhere on its own track.
    mockSettings = { [SettingKey.NOTIFICATION_SOUND_VOLUME]: 99 };
    render(<NotificationsSection />);

    expect(getVolumeSlider().value).toBe('10');
  });

  it('writes the chosen step into the settings file', () => {
    listMock.mockResolvedValueOnce([]);
    mockSettings = { [SettingKey.NOTIFICATION_SOUND_VOLUME]: 5 };
    render(<NotificationsSection />);

    fireEvent.change(getVolumeSlider(), { target: { value: '3' } });

    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND_VOLUME, 3);
  });

  it('previews the saved sound at the new step once the slider is released', () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    mockSettings = {
      [SettingKey.NOTIFICATION_SOUND]: 'Glass',
      [SettingKey.NOTIFICATION_SOUND_VOLUME]: 5,
    };
    render(<NotificationsSection />);

    const slider = getVolumeSlider();
    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.pointerUp(slider);

    // A number says nothing about how loud the result is, so it is played.
    expect(playMock).toHaveBeenCalledWith('Glass', 2);
  });

  it('does not preview while the slider is still being dragged', () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    mockSettings = {
      [SettingKey.NOTIFICATION_SOUND]: 'Glass',
      [SettingKey.NOTIFICATION_SOUND_VOLUME]: 5,
    };
    render(<NotificationsSection />);

    // Dragging across the track fires change for every step it crosses; playing
    // each one would stack ten overlapping sounds.
    fireEvent.change(getVolumeSlider(), { target: { value: '2' } });
    fireEvent.change(getVolumeSlider(), { target: { value: '3' } });

    expect(playMock).not.toHaveBeenCalled();
  });

  it('previews nothing when the sound is off', () => {
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);
    mockSettings = { [SettingKey.NOTIFICATION_SOUND]: null };
    render(<NotificationsSection />);

    const slider = getVolumeSlider();
    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.pointerUp(slider);

    expect(playMock).not.toHaveBeenCalled();
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.NOTIFICATION_SOUND_VOLUME, 2);
  });
});

describe('NotificationsSection – the fading-banner hint', () => {
  const hint = () => screen.queryByText(/disappearing too fast/i);

  /**
   * macOS decides on its own whether our banners linger or fade, and reserves
   * that switch for the user — no app can set it. A banner that vanishes after
   * a few seconds is the wrong thing for "your session finished while you were
   * away", so the row offers to walk them to it.
   */
  it('offers the fix when the OS lets banners fade', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('transient');
    render(<NotificationsSection />);

    await waitFor(() => {
      expect(hint()).toBeInTheDocument();
    });
  });

  // Nagging someone who already fixed it is worse than saying nothing.
  it('stays quiet once the banners already linger', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('persistent');
    render(<NotificationsSection />);

    await waitFor(() => {
      expect(persistenceMock).toHaveBeenCalled();
    });
    expect(hint()).not.toBeInTheDocument();
  });

  // Windows and Linux answer 'unknown' because the notification itself decides
  // there. Offering to change a setting that does not exist would be worse.
  it('stays quiet where the question does not apply', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('unknown');
    render(<NotificationsSection />);

    await waitFor(() => {
      expect(persistenceMock).toHaveBeenCalled();
    });
    expect(hint()).not.toBeInTheDocument();
  });

  it('is gone while banners are switched off, since none will be shown', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('transient');
    mockSettings = { [SettingKey.NOTIFICATION_BANNER]: false };
    render(<NotificationsSection />);

    await waitFor(() => {
      expect(getBannerToggle().getAttribute('aria-checked')).toBe('false');
    });
    expect(hint()).not.toBeInTheDocument();
  });

  it('opens the OS settings when the link is clicked', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('transient');
    render(<NotificationsSection />);

    await waitFor(() => {
      expect(hint()).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /change it here/i }));

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A settings file that has never answered reads as on, because that is what
   * happens next: the first notification raises a banner, which is what asks
   * for OS permission.
   */
  it('treats a never-answered switch as on', async () => {
    listMock.mockResolvedValueOnce([]);
    persistenceMock.mockResolvedValue('transient');
    mockSettings = { [SettingKey.NOTIFICATION_BANNER]: null };
    render(<NotificationsSection />);

    expect(getBannerToggle().getAttribute('aria-checked')).toBe('true');
    await waitFor(() => {
      expect(hint()).toBeInTheDocument();
    });
  });
});
