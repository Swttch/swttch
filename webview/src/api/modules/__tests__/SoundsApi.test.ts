import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundsApi } from '../SoundsApi';
import type { BridgeClient } from '../../bridge/BridgeClient';
import type { ApiConfig } from '../../ClaudeCodeApi';
import { MessageType } from '@/shared';

function createMockBridge() {
  return {
    request: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  } as unknown as BridgeClient;
}

describe('SoundsApi', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let config: ApiConfig;
  let api: SoundsApi;

  beforeEach(() => {
    bridge = createMockBridge();
    config = {};
    api = new SoundsApi(bridge, () => config);
  });

  describe('list()', () => {
    it('sends a LIST_SYSTEM_SOUNDS request with an empty payload', async () => {
      vi.mocked(bridge.request).mockResolvedValueOnce({ sounds: [] });

      await api.list();

      expect(bridge.request).toHaveBeenCalledWith(MessageType.LIST_SYSTEM_SOUNDS, {});
    });

    it('returns the sounds array from the response', async () => {
      const sounds = [
        { id: 'Glass', label: 'Glass' },
        { id: 'Ping', label: 'Ping' },
      ];
      vi.mocked(bridge.request).mockResolvedValueOnce({ sounds });

      const result = await api.list();

      expect(result).toEqual(sounds);
    });

    it('returns an empty array when the response is missing sounds', async () => {
      vi.mocked(bridge.request).mockResolvedValueOnce({});

      const result = await api.list();

      expect(result).toEqual([]);
    });

    it('returns an empty array when the response is null', async () => {
      vi.mocked(bridge.request).mockResolvedValueOnce(null);

      const result = await api.list();

      expect(result).toEqual([]);
    });

    it('propagates backend errors', async () => {
      vi.mocked(bridge.request).mockRejectedValueOnce(new Error('scan failed'));

      await expect(api.list()).rejects.toThrow('scan failed');
    });
  });

  describe('playNotificationSound()', () => {
    // The request names no sound. Naming one is what let a screen that had read
    // the preference at mount keep ringing it after the user changed it.
    it('sends a PLAY_NOTIFICATION_SOUND request carrying no sound name', async () => {
      vi.mocked(bridge.request).mockResolvedValueOnce({ status: 'ok' });

      await api.playNotificationSound();

      expect(bridge.request).toHaveBeenCalledWith(MessageType.PLAY_NOTIFICATION_SOUND, {});
    });

    it('names the working directory so a project-scoped choice applies', async () => {
      config = { workingDir: '/work/project' };
      vi.mocked(bridge.request).mockResolvedValueOnce({ status: 'ok' });

      await api.playNotificationSound();

      expect(bridge.request).toHaveBeenCalledWith(MessageType.PLAY_NOTIFICATION_SOUND, {
        workingDir: '/work/project',
      });
    });

    it('propagates backend errors', async () => {
      vi.mocked(bridge.request).mockRejectedValueOnce(new Error('unknown sound'));

      await expect(api.playNotificationSound()).rejects.toThrow('unknown sound');
    });
  });

  describe('play()', () => {
    it('sends a PLAY_SYSTEM_SOUND request with the soundId', async () => {
      vi.mocked(bridge.request).mockResolvedValueOnce({ status: 'ok' });

      await api.play('Glass');

      expect(bridge.request).toHaveBeenCalledWith(MessageType.PLAY_SYSTEM_SOUND, {
        soundId: 'Glass',
      });
    });

    it('propagates backend errors', async () => {
      vi.mocked(bridge.request).mockRejectedValueOnce(new Error('unknown sound'));

      await expect(api.play('Bogus')).rejects.toThrow('unknown sound');
    });
  });
});
