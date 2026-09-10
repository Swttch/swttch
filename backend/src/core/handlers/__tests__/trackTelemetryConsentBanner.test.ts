import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const trackEvent = vi.fn();
vi.mock('../../features/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));
vi.mock('../getVersion', () => ({
  getPluginVersion: () => '0.0.0-test',
}));

const { trackTelemetryConsentBannerHandler, resetTelemetryConsentBannerTracking } = await import(
  '../trackTelemetryConsentBanner'
);

const sendTo = vi.fn();
const connections = { sendTo } as unknown as ConnectionManager;
const bridge = {} as Bridge;

function report(action: unknown): void {
  const message: IPCMessage = {
    type: MessageType.TRACK_TELEMETRY_CONSENT_BANNER,
    payload: { action },
    timestamp: 0,
    requestId: 'req-1',
  };
  trackTelemetryConsentBannerHandler('conn-1', message, connections, bridge);
}

describe('trackTelemetryConsentBannerHandler', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    sendTo.mockClear();
    resetTelemetryConsentBannerTracking();
  });

  it('reports an impression outside the consent gate, so the accept rate has a denominator', () => {
    // Gating this event would mean only accepted installs are ever counted, and
    // an accept rate cannot be computed from its own numerator.
    report('show');

    expect(trackEvent).toHaveBeenCalledWith(
      'telemetry_consent_show',
      { source: 'banner', pluginVersion: '0.0.0-test' },
      { requireConsent: false },
    );
  });

  it('puts the action in the event name, since unique users cannot be split by a property', () => {
    // Rybbit counts unique users per event name and cannot filter them by a
    // custom property. With the action in properties every step of the funnel
    // would collapse into one "someone answered" count and the accept rate
    // would be uncomputable — the whole point of these events.
    report('show');
    report('dismiss');

    expect(trackEvent.mock.calls.map((call) => call[0])).toEqual([
      'telemetry_consent_show',
      'telemetry_consent_dismiss',
    ]);
    expect(trackEvent.mock.calls[0][1]).not.toHaveProperty('action');
  });

  it('reports a dismissal, the answer that leaves no trace in the stored consent state', () => {
    report('dismiss');

    expect(trackEvent.mock.calls[0][0]).toBe('telemetry_consent_dismiss');
    expect(trackEvent.mock.calls[0][2]).toEqual({ requireConsent: false });
  });

  it('reports each action once per process, so a session switch cannot inflate the count', () => {
    // The banner returns on every session switch. Counting every impression would
    // make one install look like many, and repeated closes would report more
    // dismissals than impressions — a funnel that reads backwards.
    report('show');
    report('show');
    report('dismiss');
    report('dismiss');

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent.mock.calls.map((call) => call[0])).toEqual([
      'telemetry_consent_show',
      'telemetry_consent_dismiss',
    ]);
  });

  it('ignores an unrecognized action rather than forwarding it', () => {
    // Guards the event's action values against a stale webview build or a
    // hand-crafted socket message.
    report('definitely-not-an-action');

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('ignores a non-string action', () => {
    report(42);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('acknowledges even when nothing was reported, so the webview never waits on a reply', () => {
    report('definitely-not-an-action');

    expect(sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
    });
  });
});
