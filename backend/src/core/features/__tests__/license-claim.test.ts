import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Picking up a minted key is what rescues a sponsor whose payment never reached
// their install (#256), so these tests pin down WHEN we are allowed to ask www
// and WHOSE answer is allowed to write a key to disk. Everything is mocked at
// the file + network boundary. vi.mock is hoisted above these declarations, so
// the spies must come from vi.hoisted for the factory to see them.
const {
  mockReadLicense,
  mockWasDeactivatedHere,
  mockSaveLicense,
  mockFindSponsorByInstall,
  mockReportActivation,
  mockReadProfile,
  mockVerifyLicenseRemote,
} = vi.hoisted(() => ({
  mockReadLicense: vi.fn(),
  mockWasDeactivatedHere: vi.fn(),
  mockSaveLicense: vi.fn(),
  mockFindSponsorByInstall: vi.fn(),
  mockReportActivation: vi.fn(),
  mockReadProfile: vi.fn(),
  mockVerifyLicenseRemote: vi.fn(),
}));

vi.mock('../license', () => ({
  readLicense: mockReadLicense,
  wasDeactivatedHere: mockWasDeactivatedHere,
  saveLicense: mockSaveLicense,
  findSponsorByInstall: mockFindSponsorByInstall,
  reportActivation: mockReportActivation,
  verifyLicenseRemote: mockVerifyLicenseRemote,
}));
vi.mock('../profile', () => ({ readProfile: mockReadProfile }));

import {
  claimSponsorByInstall,
  resetClaimThrottle,
  CLAIM_RETRY_INTERVAL_MS,
} from '../license-claim';

const NOW = new Date('2026-09-05T12:00:00.000Z');

describe('claimSponsorByInstall', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetClaimThrottle();
    // The default world: no key here yet, the user never turned sponsorship off,
    // and www has one waiting.
    mockReadLicense.mockReset().mockResolvedValue(null);
    mockWasDeactivatedHere.mockReset().mockResolvedValue(false);
    mockSaveLicense.mockReset().mockResolvedValue(undefined);
    mockFindSponsorByInstall.mockReset().mockResolvedValue('CCG-minted');
    mockReportActivation.mockReset().mockResolvedValue(undefined);
    mockReadProfile.mockReset().mockResolvedValue({ uuid: 'install-uuid' });
    mockVerifyLicenseRemote.mockReset().mockResolvedValue({
      valid: true,
      status: 'active',
      tier: 'allround',
      interval: 'monthly',
      price: { amount: 9, currency: 'USD' },
      cancellable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the key www minted for this install', async () => {
    const claimed = await claimSponsorByInstall({ throttled: true });

    expect(claimed).toBe(true);
    expect(mockFindSponsorByInstall).toHaveBeenCalledWith('install-uuid');
    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseKey: 'CCG-minted',
        status: 'active',
        verifiedAt: NOW.toISOString(),
      }),
    );
  });

  // by-install answers only "here is the key". Storing that alone leaves
  // `cancellable` empty, which hides "Cancel recurring sponsorship" from the
  // menu — so someone switched on automatically could not find the way to stop
  // paying. Ask what the key grants before storing it.
  it('stores what the key grants, not just the key', async () => {
    await claimSponsorByInstall({ throttled: true });

    expect(mockVerifyLicenseRemote).toHaveBeenCalledWith('CCG-minted');
    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'allround',
        interval: 'monthly',
        price: { amount: 9, currency: 'USD' },
        cancellable: true,
      }),
    );
  });

  // The key is already in hand; failing to describe it must not throw it away.
  it('still stores the key when the plan lookup fails', async () => {
    mockVerifyLicenseRemote.mockRejectedValue(new Error('network down'));

    const claimed = await claimSponsorByInstall({ throttled: true });

    expect(claimed).toBe(true);
    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'CCG-minted', status: 'active', cancellable: null }),
    );
  });

  it('tells www where the key is now in use', async () => {
    await claimSponsorByInstall({ throttled: true });

    expect(mockReportActivation).toHaveBeenCalledWith('CCG-minted');
  });

  it('does not ask when a key is already stored', async () => {
    mockReadLicense.mockResolvedValue({
      licenseKey: 'CCG-existing',
      status: 'active',
      verifiedAt: NOW.toISOString(),
    });

    const claimed = await claimSponsorByInstall({ throttled: true });

    expect(claimed).toBe(false);
    expect(mockFindSponsorByInstall).not.toHaveBeenCalled();
  });

  // The reason pick-up used to be locked to the checkout window: www still has
  // the key linked to this install id forever, so an unconditional claim would
  // hand it straight back to someone who just chose to turn sponsorship off.
  it('leaves an install alone once the user turned sponsorship off there', async () => {
    mockWasDeactivatedHere.mockResolvedValue(true);

    const claimed = await claimSponsorByInstall({ throttled: true });

    expect(claimed).toBe(false);
    expect(mockFindSponsorByInstall).not.toHaveBeenCalled();
    expect(mockSaveLicense).not.toHaveBeenCalled();
  });

  it('writes nothing when www has no key for this install', async () => {
    mockFindSponsorByInstall.mockResolvedValue(null);

    const claimed = await claimSponsorByInstall({ throttled: true });

    expect(claimed).toBe(false);
    expect(mockSaveLicense).not.toHaveBeenCalled();
    expect(mockReportActivation).not.toHaveBeenCalled();
  });

  describe('throttling', () => {
    it('asks once per interval on the background path', async () => {
      mockFindSponsorByInstall.mockResolvedValue(null);

      await claimSponsorByInstall({ throttled: true });
      await claimSponsorByInstall({ throttled: true });
      await claimSponsorByInstall({ throttled: true });

      expect(mockFindSponsorByInstall).toHaveBeenCalledTimes(1);
    });

    it('asks again once the interval has passed', async () => {
      mockFindSponsorByInstall.mockResolvedValue(null);

      await claimSponsorByInstall({ throttled: true });
      vi.setSystemTime(new Date(NOW.getTime() + CLAIM_RETRY_INTERVAL_MS));
      await claimSponsorByInstall({ throttled: true });

      expect(mockFindSponsorByInstall).toHaveBeenCalledTimes(2);
    });

    // The Sponsor screen polls every few seconds while the user watches their
    // payment land. Throttling that would put the original bug back.
    it('asks every time on the unthrottled path', async () => {
      mockFindSponsorByInstall.mockResolvedValue(null);

      await claimSponsorByInstall({ throttled: false });
      await claimSponsorByInstall({ throttled: false });
      await claimSponsorByInstall({ throttled: false });

      expect(mockFindSponsorByInstall).toHaveBeenCalledTimes(3);
    });

    it('does not let the unthrottled path start the background throttle', async () => {
      mockFindSponsorByInstall.mockResolvedValue(null);

      await claimSponsorByInstall({ throttled: false });
      await claimSponsorByInstall({ throttled: true });

      expect(mockFindSponsorByInstall).toHaveBeenCalledTimes(2);
    });
  });

  // This runs inside getSponsorStatus(), which gates features and paints the
  // sponsor screen. A failure here must read as "not a sponsor yet", never as a
  // crash on a hot path.
  it('never throws when www is unreachable', async () => {
    mockFindSponsorByInstall.mockRejectedValue(new Error('network down'));

    await expect(claimSponsorByInstall({ throttled: true })).resolves.toBe(false);
  });

  it('never throws when the license file cannot be written', async () => {
    mockSaveLicense.mockRejectedValue(new Error('EACCES'));

    await expect(claimSponsorByInstall({ throttled: true })).resolves.toBe(false);
  });
});
