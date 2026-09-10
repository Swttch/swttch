import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

// The profile mock is hoisted along with vi.mock, so its state lives in a
// hoisted holder rather than a module-scope const (which would be in its TDZ
// when the factory runs).
const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  storedStatus: { current: 'pending' },
}));

vi.mock('../../features/telemetry', () => ({
  trackEvent: mocks.trackEvent,
}));
vi.mock('../getVersion', () => ({
  getPluginVersion: () => '0.0.0-test',
}));
vi.mock('../../features/profile', () => ({
  setTelemetryConsent: (accepted: boolean) => {
    mocks.storedStatus.current = accepted ? 'accepted' : 'denied';
    return Promise.resolve();
  },
  readProfile: () =>
    Promise.resolve({
      uuid: 'test-uuid',
      telemetryConsent: { status: mocks.storedStatus.current, decidedAt: null },
    }),
  ConsentStatus: { PENDING: 'pending', ACCEPTED: 'accepted', DENIED: 'denied' },
}));

const { setTelemetryConsentHandler } = await import('../setTelemetryConsent');

const sendTo = vi.fn();
const connections = { sendTo } as unknown as ConnectionManager;
const bridge = {} as Bridge;

async function decide(accepted: boolean, source?: string): Promise<void> {
  const message: IPCMessage = {
    type: MessageType.SET_TELEMETRY_CONSENT,
    payload: source === undefined ? { accepted } : { accepted, source },
    timestamp: 0,
    requestId: 'req-1',
  };
  await setTelemetryConsentHandler('conn-1', message, connections, bridge);
}

describe('setTelemetryConsentHandler', () => {
  beforeEach(() => {
    mocks.trackEvent.mockClear();
    sendTo.mockClear();
    mocks.storedStatus.current = 'pending';
  });

  it('reports a first-time denial, which the accept rate needs as its denominator', async () => {
    // This used to be dropped on the floor: a denial from PENDING sent nothing,
    // so the only installs we ever heard from were the ones that accepted.
    await decide(false, 'banner');

    expect(mocks.trackEvent).toHaveBeenCalledWith(
      'telemetry_consent_deny',
      { source: 'banner', pluginVersion: '0.0.0-test' },
      { requireConsent: false },
    );
  });

  it('still reports a withdrawal from an install that had accepted', async () => {
    mocks.storedStatus.current = 'accepted';

    await decide(false, 'settings');

    expect(mocks.trackEvent).toHaveBeenCalledWith(
      'telemetry_consent_deny',
      { source: 'settings', pluginVersion: '0.0.0-test' },
      { requireConsent: false },
    );
  });

  it('sends an acceptance through the normal consent gate, with no bypass option', async () => {
    await decide(true, 'banner');

    expect(mocks.trackEvent).toHaveBeenCalledWith('telemetry_consent_accept', {
      source: 'banner',
      pluginVersion: '0.0.0-test',
    });
  });

  it('separates accept from deny by event name, not by a property', async () => {
    // Unique users can only be counted per event name in Rybbit, so an accept
    // rate needs accept and deny to be different names. A shared name with an
    // `action` property would make the numerator and denominator the same row.
    await decide(true, 'banner');
    mocks.storedStatus.current = 'pending';
    await decide(false, 'banner');

    expect(mocks.trackEvent.mock.calls.map((call) => call[0])).toEqual([
      'telemetry_consent_accept',
      'telemetry_consent_deny',
    ]);
    expect(mocks.trackEvent.mock.calls[0][1]).not.toHaveProperty('action');
  });

  it('falls back to "unknown" rather than forwarding a missing source', async () => {
    await decide(false);

    expect(mocks.trackEvent.mock.calls[0][1].source).toBe('unknown');
  });

  it('answers with the stored decision so the webview reflects what was persisted', async () => {
    await decide(false, 'banner');

    expect(sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      consentStatus: 'denied',
      decidedAt: null,
    });
  });
});
