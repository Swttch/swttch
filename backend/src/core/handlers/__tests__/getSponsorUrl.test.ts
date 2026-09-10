import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, SponsorGate } from '../../../shared';

const trackEvent = vi.fn();
vi.mock('../../features/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));
vi.mock('../../features/profile', () => ({
  readProfile: async () => ({ uuid: 'install-abc' }),
}));

const { getSponsorUrlHandler } = await import('../getSponsorUrl');
const { rememberFollowedGate, __resetFollowedGate } = await import('../../features/lastSponsorGate');

const bridge = {} as Bridge;

function makeConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn> };
}

async function build(payload: Record<string, unknown> = {}) {
  const connections = makeConnections();
  const message = {
    type: MessageType.GET_SPONSOR_URL,
    requestId: 'req-1',
    payload,
  } as unknown as IPCMessage;

  await getSponsorUrlHandler('conn-1', message, connections, bridge);

  const url = connections.sendTo.mock.calls[0]?.[2]?.url as string;
  return { url, params: new URL(url).searchParams };
}

beforeEach(() => {
  trackEvent.mockReset();
  __resetFollowedGate();
});

describe('getSponsorUrlHandler', () => {
  it('stamps the install id so a payment can find its way back here', async () => {
    const { params } = await build();

    expect(params.get('uid')).toBe('install-abc');
  });

  it('credits the gate the user followed to get here', async () => {
    rememberFollowedGate(SponsorGate.Schedule);

    const { params } = await build();

    expect(params.get('src')).toBe(SponsorGate.Schedule);
  });

  it('sends the origin on the URL, not only to telemetry', async () => {
    // Telemetry is opt-in. Someone who declined it still pays, and their
    // purchase would arrive with no origin at all if `src` were not on the URL —
    // which is exactly the population a per-feature rate must not silently drop.
    rememberFollowedGate(SponsorGate.AutoResume);

    const { url } = await build();

    expect(url).toContain(`src=${SponsorGate.AutoResume}`);
  });

  it('says nothing about origin when no gate sent them', async () => {
    // Someone who opened Settings and decided on their own was sold to by no
    // feature. Naming one would credit a feature that did nothing.
    const { params } = await build();

    expect(params.has('src')).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('measures the pricing page being opened, against that gate', async () => {
    rememberFollowedGate(SponsorGate.Assets);

    await build();

    expect(trackEvent).toHaveBeenCalledWith('gate_assets_opened');
  });

  it('passes the account prefill through without inventing empties', async () => {
    const { params } = await build({ email: 'a@b.c', name: '' });

    expect(params.get('email')).toBe('a@b.c');
    expect(params.has('name')).toBe(false);
  });
});
