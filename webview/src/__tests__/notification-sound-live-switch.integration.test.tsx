/**
 * The reported defect, reproduced with both screens on stage at once.
 *
 * What the reporter did, in order:
 *   1. reloaded the page, let a turn finish, and heard the saved sound (Hero);
 *   2. opened Settings and picked a different sound (Glass);
 *   3. let the next turn finish — and heard Hero again.
 *
 * The settings screen is an overlay. It is drawn on top of the chat screen and
 * the chat screen is never unmounted, so nothing ever told it to read the
 * preference again; it had read it once, when it mounted, and it kept naming
 * that sound in every request it sent. The browser's `storage` event, the one
 * thing that used to resync the two, does not fire in the window that made the
 * change, so the copy underneath could never be corrected.
 *
 * This test puts both screens under one settings store — the real
 * `SettingsProvider`, over a stand-in backend that stores what it is told to
 * save and answers a play request by looking up what it currently holds, which
 * is what the real backend handler does (see the backend's
 * `playNotificationSound.test.ts`). Then it replays the three steps above and
 * asks which sounds were played.
 *
 * Nothing is remounted and nothing is reloaded between the two turns.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { SettingKey } from '@/types/settings';

// ---------------------------------------------------------------------------
// The stand-in backend: one settings store, and a play request that resolves
// the sound name against that store at the moment it arrives.
// ---------------------------------------------------------------------------

let savedSettings: Record<string, unknown> = {};
let playedSounds: string[] = [];
let previewedSounds: string[] = [];

function playNotificationSoundOnBackend(): void {
  const saved = savedSettings[SettingKey.NOTIFICATION_SOUND];
  if (typeof saved !== 'string' || saved.trim() === '') return;
  playedSounds.push(saved);
}

const sendMock = vi.fn(async (type: string, payload?: Record<string, unknown>) => {
  switch (type) {
    case MessageType.GET_SETTINGS:
      return { settings: { ...savedSettings }, overrides: [] };
    case MessageType.SAVE_SETTINGS: {
      const key = payload?.['key'];
      if (typeof key === 'string') {
        savedSettings = { ...savedSettings, [key]: payload?.['value'] };
      }
      return { status: 'ok' };
    }
    default:
      return undefined;
  }
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    subscribe: () => () => {},
    lastMessage: null,
    connectionStatus: 'connected' as const,
  }),
  BridgeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/work/project' }),
  useWorkingDirOrNull: () => ({ workingDirectory: '/work/project' }),
  WorkingDirProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    sounds: {
      list: async () => [
        { id: 'Hero', label: 'Hero' },
        { id: 'Glass', label: 'Glass' },
      ],
      // The turn-end path: no sound name crosses the wire, the backend looks it up.
      playNotificationSound: async () => playNotificationSoundOnBackend(),
      // The settings preview: names the row the user just pointed at.
      play: async (soundId: string) => {
        previewedSounds.push(soundId);
      },
    },
    notifications: {
      show: async () => {},
      // No macOS underneath a jsdom test, so the banner row's hint stays hidden.
      bannerPersistence: async () => 'unknown',
      openSystemSettings: async () => {},
    },
  },
}));

import { SettingsProvider } from '@/contexts/SettingsContext';
import { NotificationsSection } from '@/pages/SettingsPage/General/Notifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { _resetSystemSoundsCache } from '@/notifications/useSystemSounds';

/**
 * The chat screen, reduced to the part that matters here: it reports whether a
 * turn is running, and it is the thing that fires the end-of-turn notification.
 */
function ChatScreen({ isStreaming }: { isStreaming: boolean }) {
  useDocumentTitle('Session A', false, isStreaming, null, false);
  return <div data-testid="chat-screen" />;
}

function Stage({ isStreaming }: { isStreaming: boolean }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>
        {/* The chat screen stays mounted the whole time; the settings overlay
            is drawn on top of it, not in place of it. */}
        <ChatScreen isStreaming={isStreaming} />
        <NotificationsSection />
      </SettingsProvider>
    </QueryClientProvider>
  );
}

const soundTrigger = () =>
  screen.getByRole('button', { name: /Notification Sound/i }) as HTMLButtonElement;

async function pickSound(label: string) {
  await waitFor(() => {
    expect(soundTrigger().disabled).toBe(false);
  });
  fireEvent.click(soundTrigger());
  fireEvent.click(screen.getByRole('option', { name: label }));
  // Let the save round-trip through the stand-in backend.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  savedSettings = {};
  playedSounds = [];
  previewedSounds = [];
  sendMock.mockClear();
  _resetSystemSoundsCache();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

describe('changing the notification sound while a chat screen is open', () => {
  it('rings the newly chosen sound on the very next turn, with nothing reloaded', async () => {
    savedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Hero' };

    const { rerender } = render(<Stage isStreaming={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('chat-screen')).toBeInTheDocument();
    });

    // Turn one ends. The saved sound is Hero.
    rerender(<Stage isStreaming={false} />);
    expect(playedSounds).toEqual(['Hero']);

    // The user opens Settings — which does not unmount the chat screen — and
    // picks Glass.
    await pickSound('Glass');
    expect(savedSettings[SettingKey.NOTIFICATION_SOUND]).toBe('Glass');

    // Turn two runs and ends on that same, never-remounted chat screen.
    rerender(<Stage isStreaming={true} />);
    rerender(<Stage isStreaming={false} />);

    expect(playedSounds).toEqual(['Hero', 'Glass']);
  });

  it('stops ringing entirely when the user picks Off, on the next turn', async () => {
    savedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Hero' };

    const { rerender } = render(<Stage isStreaming={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('chat-screen')).toBeInTheDocument();
    });

    rerender(<Stage isStreaming={false} />);
    expect(playedSounds).toEqual(['Hero']);

    await pickSound('Off');
    expect(savedSettings[SettingKey.NOTIFICATION_SOUND]).toBeNull();

    rerender(<Stage isStreaming={true} />);
    rerender(<Stage isStreaming={false} />);

    expect(playedSounds).toEqual(['Hero']);
  });

  it('previews the sound the user pointed at, which is a different question', async () => {
    // The preview is the one place a sound name still travels, and it should:
    // the user is asking what a row in the list sounds like, not asking what is
    // saved. Picking Off asks nothing, so nothing is previewed.
    savedSettings = { [SettingKey.NOTIFICATION_SOUND]: 'Hero' };

    render(<Stage isStreaming={false} />);
    await pickSound('Glass');
    expect(previewedSounds).toEqual(['Glass']);

    await pickSound('Off');
    expect(previewedSounds).toEqual(['Glass']);
  });
});
