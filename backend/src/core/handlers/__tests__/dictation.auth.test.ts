import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted with the mock factory, which vitest lifts above these declarations.
const kit = vi.hoisted(() => {
  class FakeKitMissingError extends Error {}
  class FakeKitTooOldError extends Error {}
  const spawnSpeechToText = vi.fn(async () => ({ sendAudio: vi.fn(), close: vi.fn() }));
  const probeSpeechToTextAvailable = vi.fn(async () => true);
  return {
    FakeKitMissingError,
    FakeKitTooOldError,
    spawnSpeechToText,
    probeSpeechToTextAvailable,
  };
});

const { FakeKitMissingError, FakeKitTooOldError, spawnSpeechToText, probeSpeechToTextAvailable } =
  kit;

// Every export dictation.ts pulls from the module has to be listed: a factory
// like this REPLACES the module, so anything omitted becomes undefined at the
// import site rather than falling through to the real thing.
vi.mock('../../extend-kit', () => ({
  spawnSpeechToText: kit.spawnSpeechToText,
  probeSpeechToTextAvailable: kit.probeSpeechToTextAvailable,
  getExtendKitVersion: vi.fn(async () => '0.4.0'),
  resetExtendKitCache: vi.fn(),
  ExtendKitMissingError: kit.FakeKitMissingError,
  ExtendKitTooOldError: kit.FakeKitTooOldError,
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
 * A probe that fails for a reason that is not about setup.
 *
 * The original shape of this on a machine authenticated by API key alone was a
 * TypeError out of `getAccessToken` reading `.accessToken` off credentials with
 * no `claudeAiOauth` (#355). That read now happens inside the spawned `ccb stt`
 * rather than here, but the contract it proved still has to hold: anything that
 * is not a kit problem answers "not logged in", and its raw text never reaches
 * the banner.
 */
function probeFailsOpaquely(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'accessToken')");
}

describe('dictation on a machine with no Claude account login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeSpeechToTextAvailable.mockResolvedValue(true);
  });

  describe('START_DICTATION', () => {
    it('reports a missing login rather than the raw exception text', async () => {
      probeSpeechToTextAvailable.mockImplementation(probeFailsOpaquely);
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      const payload = lastPayload(conns);
      expect(payload.status).toBe('error');
      expect(payload.errorKind).toBe(DictationErrorKind.NOT_LOGGED_IN);
      // The whole point of the issue: this text must never reach the banner.
      expect(String(payload.error)).not.toContain('accessToken');
    });

    // Spawning would hand `ccb stt` a login it cannot use and fail late, after
    // the microphone is already live and the user is already talking.
    it('does not spawn a stream when there is nothing to authorize with', async () => {
      probeSpeechToTextAvailable.mockResolvedValue(false);

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), mockConns(), bridge);

      expect(spawnSpeechToText).not.toHaveBeenCalled();
    });

    it('still spawns a stream when a login is there', async () => {
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      expect(spawnSpeechToText).toHaveBeenCalledTimes(1);
      expect(lastPayload(conns).status).toBe('ok');
    });

    it('keeps naming a missing kit as a missing kit', async () => {
      probeSpeechToTextAvailable.mockRejectedValue(new FakeKitMissingError());
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      expect(lastPayload(conns).errorKind).toBe(DictationErrorKind.KIT_MISSING);
    });

    // A kit without `ccb stt` is a setup problem, not a login problem. Telling
    // this user to sign in would send them to fix something that is not broken.
    it('names a kit too old for ccb stt as a kit problem, not a login problem', async () => {
      probeSpeechToTextAvailable.mockRejectedValue(new FakeKitTooOldError('no stt'));
      const conns = mockConns();

      await startDictationHandler('c1', msg(MessageType.START_DICTATION), conns, bridge);

      expect(lastPayload(conns).errorKind).toBe(DictationErrorKind.KIT_MISSING);
      expect(spawnSpeechToText).not.toHaveBeenCalled();
    });
  });

  describe('GET_DICTATION_AVAILABILITY', () => {
    // The handler used to catch everything and call all of it `kit_missing`,
    // which named the wrong problem for the case that actually happens: an
    // installed kit with no login behind it.
    it('blames the login, not the kit, when the kit is fine', async () => {
      probeSpeechToTextAvailable.mockImplementation(probeFailsOpaquely);
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
      probeSpeechToTextAvailable.mockRejectedValue(new FakeKitMissingError());
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

    it('blames the kit when it is installed but too old to stream', async () => {
      probeSpeechToTextAvailable.mockRejectedValue(new FakeKitTooOldError('no stt'));
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
