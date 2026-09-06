import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted with the mock factory, which vitest lifts above these declarations.
const kit = vi.hoisted(() => {
  class FakeKitMissingError extends Error {}
  const openSpeechToTextStream = vi.fn(async () => ({ sendAudio: vi.fn(), close: vi.fn() }));
  const isSpeechToTextAvailable = vi.fn(async () => true);
  const loadSpeechToText = vi.fn(async () => ({ openSpeechToTextStream, isSpeechToTextAvailable }));
  return { FakeKitMissingError, openSpeechToTextStream, isSpeechToTextAvailable, loadSpeechToText };
});

const { FakeKitMissingError, openSpeechToTextStream, isSpeechToTextAvailable, loadSpeechToText } =
  kit;

vi.mock('../../extend-kit', () => ({
  loadSpeechToText: kit.loadSpeechToText,
  getExtendKitVersion: vi.fn(async () => '0.4.0'),
  resetExtendKitCache: vi.fn(),
  ExtendKitMissingError: kit.FakeKitMissingError,
  EXTEND_KIT_PACKAGE: '@swttch/extend-kit',
}));
vi.mock('../getCliUpdateInfo', () => ({
  fetchDistTags: vi.fn(async () => ({ stable: null, latest: '0.4.0' })),
}));

import { startDictationHandler, getDictationAvailabilityHandler } from '../dictation';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, DictationErrorKind } from '../../../shared';

const bridge = {} as Bridge;

function mockConns() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

function msg(type: MessageType): IPCMessage {
  return { type, payload: {}, timestamp: 0, requestId: 'req-1' };
}

function lastPayload(conns: ConnectionManager): Record<string, unknown> {
  const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][2];
}

/**
 * The exact failure the kit produces on a machine authenticated by API key
 * alone: `getAccessToken` reads `.accessToken` off a credentials object that has
 * no `claudeAiOauth`, so a TypeError comes out of the property read. It is not
 * the kit's own error type, so the kit's probe rethrows it rather than
 * answering false (#355).
 */
function credentialsWithoutOauth(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'accessToken')");
}

describe('dictation on a machine with no Claude account login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSpeechToTextAvailable.mockResolvedValue(true);
    loadSpeechToText.mockResolvedValue({ openSpeechToTextStream, isSpeechToTextAvailable });
  });

  describe('START_DICTATION', () => {
    it('reports a missing login rather than the raw exception text', async () => {
      isSpeechToTextAvailable.mockImplementation(credentialsWithoutOauth);
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      const payload = lastPayload(conns);
      expect(payload.status).toBe('error');
      expect(payload.errorKind).toBe(DictationErrorKind.NOT_LOGGED_IN);
      // The whole point of the issue: this text must never reach the banner.
      expect(String(payload.error)).not.toContain('accessToken');
    });

    // Opening the socket would send `Bearer undefined` and fail late, after the
    // microphone is already live and the user is already talking.
    it('does not open a stream when there is nothing to authorize with', async () => {
      isSpeechToTextAvailable.mockResolvedValue(false);

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), mockConns(), bridge);

      expect(openSpeechToTextStream).not.toHaveBeenCalled();
    });

    it('still opens a stream when a login is there', async () => {
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      expect(openSpeechToTextStream).toHaveBeenCalledTimes(1);
      expect(lastPayload(conns).status).toBe('ok');
    });

    it('keeps naming a missing kit as a missing kit', async () => {
      loadSpeechToText.mockRejectedValue(new FakeKitMissingError());
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      expect(lastPayload(conns).errorKind).toBe(DictationErrorKind.KIT_MISSING);
    });
  });

  describe('GET_DICTATION_AVAILABILITY', () => {
    // The handler used to catch everything and call all of it `kit_missing`,
    // which named the wrong problem for the case that actually happens: an
    // installed kit with no login behind it.
    it('blames the login, not the kit, when the kit loaded fine', async () => {
      isSpeechToTextAvailable.mockImplementation(credentialsWithoutOauth);
      const conns = mockConns();

      await getDictationAvailabilityHandler(
        'c1',
        msg(MessageType.GET_DICTATION_AVAILABILITY),
        conns,
        bridge,
      );

      expect(lastPayload(conns)).toMatchObject({
        status: 'ok',
        available: false,
        reason: DictationErrorKind.NOT_LOGGED_IN,
      });
    });

    it('blames the kit when the kit is the thing missing', async () => {
      loadSpeechToText.mockRejectedValue(new FakeKitMissingError());
      const conns = mockConns();

      await getDictationAvailabilityHandler(
        'c1',
        msg(MessageType.GET_DICTATION_AVAILABILITY),
        conns,
        bridge,
      );

      expect(lastPayload(conns)).toMatchObject({
        available: false,
        reason: DictationErrorKind.KIT_MISSING,
      });
    });

    it('answers available with no reason when dictation can run', async () => {
      const conns = mockConns();

      await getDictationAvailabilityHandler(
        'c1',
        msg(MessageType.GET_DICTATION_AVAILABILITY),
        conns,
        bridge,
      );

      expect(lastPayload(conns)).toMatchObject({ available: true, reason: null });
    });
  });
});
