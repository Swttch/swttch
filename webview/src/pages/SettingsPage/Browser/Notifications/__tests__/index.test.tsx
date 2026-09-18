import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// api.sounds mocking
// ---------------------------------------------------------------------------

const listMock = vi.fn();
const playMock = vi.fn();

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    sounds: {
      list: (...args: unknown[]) => listMock(...args),
      play: (...args: unknown[]) => playMock(...args),
    },
  },
}));

import { NotificationsSection } from '..';
import {
  SOUND_OFF,
  NOTIFICATION_SOUND_STORAGE_KEY,
} from '@/notifications';
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
});

const getTrigger = () =>
  screen.getByRole('button', { name: /Notification Sound/i }) as HTMLButtonElement;

/** Open the dropdown and return the visible option labels (stripped of the ✓ marker). */
const openAndGetOptionLabels = () => {
  fireEvent.click(getTrigger());
  return screen
    .getAllByRole('option')
    .map((o) => o.textContent?.replace('✓', '').trim());
};

describe('NotificationsSection', () => {
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

  it('reads the persisted selection at mount', async () => {
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, 'Ping');
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

  it('persists the new value to localStorage and previews it on change', async () => {
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
    expect(localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY)).toBe('Glass');
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledWith('Glass');
  });

  it('does NOT preview when the user selects Off', async () => {
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, 'Glass');
    listMock.mockResolvedValueOnce([{ id: 'Glass', label: 'Glass' }]);

    render(<NotificationsSection />);
    await waitFor(() => {
      expect(getTrigger().disabled).toBe(false);
    });
    expect(getTrigger().textContent).toContain('Glass');

    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Off' }));

    expect(getTrigger().textContent).toContain('Off');
    expect(localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY)).toBe(SOUND_OFF);
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
});
