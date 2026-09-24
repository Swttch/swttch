import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spread the real module: this handler also calls normalizeVolumeStep, and
// a factory that lists only playSystemSound deletes every other export.
vi.mock('../../../system-sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../system-sounds')>()),
  playSystemSound: vi.fn(),
}));

vi.mock('../../features/settings', () => ({
  readMergedSettings: vi.fn(),
}));

import { playSystemSound } from '../../../system-sounds';
import { readMergedSettings } from '../../features/settings';
import { playNotificationSoundHandler } from '../playNotificationSound';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockPlay = vi.mocked(playSystemSound);
const mockReadMergedSettings = vi.mocked(readMergedSettings);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

function request(requestId: string, payload: Record<string, unknown> = {}): IPCMessage {
  return {
    type: MessageType.PLAY_NOTIFICATION_SOUND,
    payload,
    timestamp: 0,
    requestId,
  };
}

/** Stands in for the plugin settings file the handler reads on every request. */
function settingsFileSays(settings: Record<string, unknown>) {
  mockReadMergedSettings.mockResolvedValue({ settings, overrides: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPlay.mockResolvedValue(undefined);
});

describe('playNotificationSoundHandler', () => {
  it('plays the sound named by the settings file', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).toHaveBeenCalledWith('Hero', { volumeStep: 5 });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      played: true,
    });
  });

  /**
   * The reported defect, reproduced end to end on the half that now owns the
   * answer.
   *
   * What the reporter saw: the first turn after a reload rang the saved sound,
   * then they picked a different one in the settings overlay and the very next
   * turn rang the OLD sound again. The overlay draws on top of the chat screen
   * without unmounting it, and back then the chat screen was the thing that
   * named the sound — it had read the preference once, at mount, and nothing
   * ever told it to read again.
   *
   * So the setting changes here between two requests with no restart, no
   * reconnection and no re-read by the caller, and the second request has to
   * ring the new sound.
   */
  it('rings the newly chosen sound on the very next request, with nothing restarted', async () => {
    const connections = createMockConnections();

    settingsFileSays({ notificationSound: 'Hero' });
    await playNotificationSoundHandler('conn-1', request('turn-1'), connections, mockBridge);

    // The user picks Glass in the settings overlay; the chat screen underneath
    // is untouched and keeps the same connection.
    settingsFileSays({ notificationSound: 'Glass' });
    await playNotificationSoundHandler('conn-1', request('turn-2'), connections, mockBridge);

    expect(mockPlay.mock.calls.map((call) => call[0])).toEqual(['Hero', 'Glass']);
  });

  /**
   * The volume is read the same way and at the same moment as the sound name,
   * for the same reason: a screen that cached it would go on ringing at the old
   * loudness after the user moved the control in the overlay above it.
   */
  it('plays at the volume step the settings file names', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero', notificationSoundVolume: 4 });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).toHaveBeenCalledWith('Hero', { volumeStep: 4 });
  });

  it('picks up a changed volume on the very next request, with nothing restarted', async () => {
    const connections = createMockConnections();

    settingsFileSays({ notificationSound: 'Hero', notificationSoundVolume: 10 });
    await playNotificationSoundHandler('conn-1', request('turn-1'), connections, mockBridge);

    settingsFileSays({ notificationSound: 'Hero', notificationSoundVolume: 2 });
    await playNotificationSoundHandler('conn-1', request('turn-2'), connections, mockBridge);

    expect(mockPlay.mock.calls.map((call) => call[1])).toEqual([
      { volumeStep: 10 },
      { volumeStep: 2 },
    ]);
  });

  it('falls back to the default step when the settings file has no volume in it', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).toHaveBeenCalledWith('Hero', { volumeStep: 5 });
  });

  it('plays nothing, and reports success, when the user chose no sound', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: null });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      played: false,
    });
  });

  it('treats a blank setting as no sound', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: '   ' });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      played: false,
    });
  });

  it('carries no sound name of its own — the request may not name one', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });

    // A caller that tries to name a sound is ignored: naming it is what let a
    // stale screen win.
    await playNotificationSoundHandler(
      'conn-1',
      request('req-1', { soundId: 'Glass' }),
      connections,
      mockBridge,
    );

    expect(mockPlay).toHaveBeenCalledWith('Hero', { volumeStep: 5 });
  });

  it('reads the project settings for the working directory it is given', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });

    await playNotificationSoundHandler(
      'conn-1',
      request('req-1', { workingDir: '/work/project' }),
      connections,
      mockBridge,
    );

    expect(mockReadMergedSettings).toHaveBeenCalledWith('/work/project');
  });

  it('reads the global settings when no working directory is given', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockReadMergedSettings).toHaveBeenCalledWith(undefined);
  });

  it('surfaces the underlying error when the saved sound no longer exists', async () => {
    const connections = createMockConnections();
    settingsFileSays({ notificationSound: 'Hero' });
    mockPlay.mockRejectedValue(new Error('Unknown sound id: Hero'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'Unknown sound id: Hero',
    });
    errorSpy.mockRestore();
  });

  it('surfaces the error when the settings file cannot be read', async () => {
    const connections = createMockConnections();
    mockReadMergedSettings.mockRejectedValue(new Error('EACCES'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await playNotificationSoundHandler('conn-1', request('req-1'), connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'EACCES',
    });
    errorSpy.mockRestore();
  });
});
