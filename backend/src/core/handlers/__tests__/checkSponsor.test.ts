import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageType } from '../../../shared';

// CHECK_SPONSOR is the one entry point allowed to lift a deactivation, because
// it only ever arrives when the user acted — pressing "Sponsor" or asking to
// switch this device back on. These tests hold that line from both sides: it
// must lift, and the background paths must not.
const { mockGetSponsorStatus, mockClearDeactivation, mockClaimSponsorByInstall } = vi.hoisted(
  () => ({
    mockGetSponsorStatus: vi.fn(),
    mockClearDeactivation: vi.fn(),
    mockClaimSponsorByInstall: vi.fn(),
  }),
);

vi.mock('../../features/license', () => ({
  getSponsorStatus: mockGetSponsorStatus,
  clearDeactivation: mockClearDeactivation,
}));
vi.mock('../../features/license-claim', () => ({
  claimSponsorByInstall: mockClaimSponsorByInstall,
}));

import { checkSponsorHandler } from '../checkSponsor';

const sendTo = vi.fn();
const connections = { sendTo } as unknown as Parameters<typeof checkSponsorHandler>[2];
const bridge = {} as unknown as Parameters<typeof checkSponsorHandler>[3];
const message = { type: MessageType.CHECK_SPONSOR, requestId: 'req-1' } as Parameters<
  typeof checkSponsorHandler
>[1];

beforeEach(() => {
  sendTo.mockReset();
  mockClearDeactivation.mockReset().mockResolvedValue(undefined);
  mockClaimSponsorByInstall.mockReset().mockResolvedValue(false);
  mockGetSponsorStatus.mockReset().mockResolvedValue({ isSponsor: false });
});

describe('checkSponsorHandler', () => {
  // The regression this exists to prevent: after deactivating, pressing
  // "Sponsor" polls this handler, and a claim that still respected the old
  // marker would refuse forever — leaving the user no way back in short of a
  // key they do not have a copy of.
  it('lifts an earlier deactivation before claiming', async () => {
    await checkSponsorHandler('conn-1', message, connections, bridge);

    expect(mockClearDeactivation).toHaveBeenCalledTimes(1);
    expect(mockClearDeactivation.mock.invocationCallOrder[0]).toBeLessThan(
      mockClaimSponsorByInstall.mock.invocationCallOrder[0],
    );
  });

  // The user is watching a payment land, so every poll should really ask.
  it('claims without the throttle', async () => {
    await checkSponsorHandler('conn-1', message, connections, bridge);

    expect(mockClaimSponsorByInstall).toHaveBeenCalledWith({ throttled: false });
  });

  it('answers with the resulting sponsor state', async () => {
    mockGetSponsorStatus.mockResolvedValue({
      isSponsor: true,
      licenseKey: 'CCG-minted',
      status: 'active',
    });

    await checkSponsorHandler('conn-1', message, connections, bridge);

    expect(sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      isSponsor: true,
      licenseKey: 'CCG-minted',
      licenseStatus: 'active',
    });
  });
});
