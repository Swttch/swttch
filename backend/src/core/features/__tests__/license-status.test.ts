import { describe, it, expect, vi, beforeEach } from 'vitest';

// getSponsorStatus reads the license file and re-validates through www. Both are
// stubbed at the boundary so these tests assert one thing only: how a stored
// license turns into an entitlement decision.
const { mockReadFile, mockClaimSponsorByInstall } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockClaimSponsorByInstall: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}));
vi.mock('../license-revalidation', () => ({
  revalidateStoredLicense: vi.fn(() => Promise.resolve()),
}));
vi.mock('../license-claim', () => ({
  claimSponsorByInstall: mockClaimSponsorByInstall,
}));

import { getSponsorStatus } from '../license';

function stored(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    licenseKey: 'CCG-abc',
    status: 'active',
    verifiedAt: '2026-08-22T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(() => {
  mockReadFile.mockReset();
  mockClaimSponsorByInstall.mockReset().mockResolvedValue(false);
});

describe('getSponsorStatus', () => {
  it('has no key and no entitlement when nothing is stored', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const status = await getSponsorStatus();

    expect(status.isSponsor).toBe(false);
    expect(status.licenseKey).toBeUndefined();
  });

  it('grants entitlement while the stored status is active', async () => {
    mockReadFile.mockResolvedValue(stored());

    const status = await getSponsorStatus();

    expect(status.isSponsor).toBe(true);
    expect(status.licenseKey).toBe('CCG-abc');
  });

  // The point of the split: entitlement ends, the key does not. Whoever needs
  // "has this person ever paid?" — the billing history, the past-sponsor UI —
  // reads licenseKey, which survives.
  it.each(['expired', 'refunded'])(
    'withholds entitlement but keeps the key when the status is %s',
    async (status) => {
      mockReadFile.mockResolvedValue(stored({ status }));

      const result = await getSponsorStatus();

      expect(result.isSponsor).toBe(false);
      expect(result.licenseKey).toBe('CCG-abc');
      expect(result.status).toBe(status);
    },
  );

  // Licenses written before www reported a status are real sponsors; reading the
  // absence as "not active" would silently revoke them on upgrade.
  it('treats a license stored without a status as active', async () => {
    mockReadFile.mockResolvedValue(stored({ status: undefined }));

    const status = await getSponsorStatus();

    expect(status.isSponsor).toBe(true);
  });

  // Plan details outlive entitlement too, so a past sponsor's screen can still
  // say what they were on.
  it('keeps the cached plan details on a lapsed license', async () => {
    mockReadFile.mockResolvedValue(
      stored({
        status: 'expired',
        tier: 'jetbrains',
        interval: 'monthly',
        price: { amount: 5, currency: 'USD' },
      }),
    );

    const status = await getSponsorStatus();

    expect(status.isSponsor).toBe(false);
    expect(status.tier).toBe('jetbrains');
    expect(status.price).toEqual({ amount: 5, currency: 'USD' });
  });

  // A sponsor whose key never reached this install has nothing on disk to
  // revalidate, so asking here is their only way back in — and this is the wiring
  // that makes it happen anywhere the sponsor state is read, rather than only in
  // the ten-minute window after checkout (#256).
  describe('picking up a key that never arrived', () => {
    it('asks www for a minted key when nothing is stored', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await getSponsorStatus();

      expect(mockClaimSponsorByInstall).toHaveBeenCalledWith({ throttled: true });
    });

    // Ordering, not just wiring: the claim writes the key, so reading the license
    // before it would report "not a sponsor" to someone who just got one. The
    // stub only makes the file appear once the claim has run, so a read that
    // happens first fails this test.
    it('reports the entitlement the pick-up just granted', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockClaimSponsorByInstall.mockImplementation(async () => {
        mockReadFile.mockResolvedValue(stored({ licenseKey: 'CCG-minted' }));
        return true;
      });

      const status = await getSponsorStatus();

      expect(status.isSponsor).toBe(true);
      expect(status.licenseKey).toBe('CCG-minted');
    });
  });
});
