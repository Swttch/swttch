import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spread the real module: this handler also calls normalizeVolumeStep, and
// a factory that lists only playSystemSound deletes every other export.
vi.mock('../../../system-sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../system-sounds')>()),
  playSystemSound: vi.fn(),
}));

import { playSystemSound } from '../../../system-sounds';
import { playSystemSoundHandler } from '../playSystemSound';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockPlay = vi.mocked(playSystemSound);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

describe('playSystemSoundHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays the sound and acks ok', async () => {
    const connections = createMockConnections();
    mockPlay.mockResolvedValue(undefined);
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: { soundId: 'Glass' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    // A preview that names no volume plays at the default step, so a caller
    // with no volume of its own still auditions the sound.
    expect(mockPlay).toHaveBeenCalledWith('Glass', { volumeStep: 5 });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
    });
  });

  /**
   * The preview names its own volume rather than reading the saved one. The
   * user is auditioning the value they are holding, and reading the file would
   * mean waiting for the write to land — so a slow save would preview the
   * previous volume, which is the defect this whole change removes.
   */
  it('plays at the volume the request names, without consulting the settings file', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: { soundId: 'Glass', volumeStep: 3 },
      timestamp: 0,
      requestId: 'req-vol',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    expect(mockPlay).toHaveBeenCalledWith('Glass', { volumeStep: 3 });
  });

  it('rejects when soundId is missing', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: {},
      timestamp: 0,
      requestId: 'req-1',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'Missing or invalid soundId',
    });
  });

  it('rejects when soundId is not a string', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: { soundId: 123 as unknown as string },
      timestamp: 0,
      requestId: 'req-1',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'Missing or invalid soundId',
    });
  });

  it('rejects empty string soundId', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: { soundId: '' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    expect(mockPlay).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
    }));
  });

  it('surfaces the underlying error message when play throws', async () => {
    const connections = createMockConnections();
    mockPlay.mockRejectedValue(new Error('Unknown sound id: Nope'));
    const message: IPCMessage = {
      type: MessageType.PLAY_SYSTEM_SOUND,
      payload: { soundId: 'Nope' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await playSystemSoundHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'Unknown sound id: Nope',
    });
  });
});
