import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const trackEvent = vi.fn();
vi.mock('../../features/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { imageAttachedHandler } = await import('../imageAttached');

const connections = {} as ConnectionManager;
const bridge = {} as Bridge;

function attach(payload: Record<string, unknown>): void {
  const message: IPCMessage = {
    type: MessageType.IMAGE_ATTACHED,
    payload,
    timestamp: 0,
  };
  imageAttachedHandler('conn-1', message, connections, bridge);
}

describe('imageAttachedHandler', () => {
  beforeEach(() => trackEvent.mockClear());

  it('records the attach path so the three entry points can be told apart', () => {
    attach({ source: 'paste', mimeType: 'image/png', size: 1024 });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('image_attached', {
      source: 'paste',
      mimeType: 'image/png',
      size: 1024,
    });
  });

  it.each(['button', 'paste', 'drop'])('passes through the known source %s', (source) => {
    attach({ source, mimeType: 'image/png', size: 1 });

    expect(trackEvent.mock.calls[0][1].source).toBe(source);
  });

  it('falls back to "unknown" rather than forwarding an unrecognized source', () => {
    // Guards the telemetry properties against an arbitrary string arriving from
    // a stale webview build or a hand-crafted socket message.
    attach({ source: 'definitely-not-a-source', mimeType: 'image/png', size: 1 });

    expect(trackEvent.mock.calls[0][1].source).toBe('unknown');
  });

  it('still records the attach when the payload is empty', () => {
    // The headcount is the point of this event, so a malformed payload must not
    // make an attach disappear from telemetry.
    attach({});

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('image_attached', {
      source: 'unknown',
      mimeType: 'unknown',
      size: 0,
    });
  });

  it('does not forward a non-numeric size', () => {
    attach({ source: 'drop', mimeType: 'image/webp', size: '1024' });

    expect(trackEvent.mock.calls[0][1].size).toBe(0);
  });
});
