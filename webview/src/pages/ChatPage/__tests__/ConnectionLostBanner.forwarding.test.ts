import { describe, expect, it } from 'vitest';
import { ForwardingFallback } from '@/api/bridge/forwardingFallback';
import { forwardingReasonText } from '../ConnectionLostBanner';

/** Echoes the key, so a test can tell which sentence was chosen without depending on its wording. */
const keyOnly = (key: string) => key;

describe('forwardingReasonText', () => {
  it('says nothing when the IDE forwarded the port or there is nothing to forward', () => {
    expect(forwardingReasonText(null, keyOnly)).toBeNull();
  });

  it('names a client with Port Forwarding turned off', () => {
    expect(forwardingReasonText(ForwardingFallback.Disabled, keyOnly)).toBe(
      'connectionLost.forwarding.disabled',
    );
  });

  it('names a client that has not opened the forwarded port yet', () => {
    expect(forwardingReasonText(ForwardingFallback.NotAssigned, keyOnly)).toBe(
      'connectionLost.forwarding.notAssigned',
    );
  });

  it('treats a host still waiting for its client like a client that has not opened the port', () => {
    expect(forwardingReasonText(ForwardingFallback.NoClient, keyOnly)).toBe(
      'connectionLost.forwarding.notAssigned',
    );
  });

  it('sends both reasons that need the host log to the same sentence', () => {
    expect(forwardingReasonText(ForwardingFallback.ApiUnavailable, keyOnly)).toBe(
      'connectionLost.forwarding.unavailable',
    );
    expect(forwardingReasonText(ForwardingFallback.Failed, keyOnly)).toBe(
      'connectionLost.forwarding.unavailable',
    );
  });
});
