import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The stored license is the source of the sponsor entitlement, so re-validation
// is mocked at the file + network boundary: we assert WHEN the key is re-checked
// against www and WHETHER a given answer is allowed to revoke sponsorship.
// vi.mock is hoisted above these declarations, so the spies must be created by
// vi.hoisted for the factory to see them.
const { mockReadLicense, mockSaveLicense, mockClearLicense, mockReportActivation } = vi.hoisted(
  () => ({
    mockReadLicense: vi.fn(),
    mockSaveLicense: vi.fn(),
    mockClearLicense: vi.fn(),
    mockReportActivation: vi.fn(),
  }),
);
const mockVerifyRemote = vi.fn();

vi.mock('../license', () => ({
  readLicense: mockReadLicense,
  saveLicense: mockSaveLicense,
  clearLicense: mockClearLicense,
  reportActivation: mockReportActivation,
}));

import {
  revalidateStoredLicense,
  REVALIDATE_INTERVAL_MS,
} from '../license-revalidation';

function storedLicense(verifiedAt: string) {
  return { licenseKey: 'CCG-abc', status: 'active', verifiedAt };
}

/** A licence with every plan detail already cached — nothing left to fetch. */
function fullyCached(verifiedAt: string) {
  return {
    ...storedLicense(verifiedAt),
    tier: 'jetbrains',
    interval: 'monthly',
    price: { amount: 5, currency: 'USD' },
  };
}

const NOW = new Date('2026-07-27T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe('revalidateStoredLicense', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockReadLicense.mockReset();
    mockSaveLicense.mockReset().mockResolvedValue(undefined);
    mockClearLicense.mockReset().mockResolvedValue(undefined);
    mockReportActivation.mockReset().mockResolvedValue(undefined);
    mockVerifyRemote.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when there is no stored license', async () => {
    mockReadLicense.mockResolvedValue(null);

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockVerifyRemote).not.toHaveBeenCalled();
    expect(mockClearLicense).not.toHaveBeenCalled();
  });

  it('skips the network call while the last check is still fresh', async () => {
    mockReadLicense.mockResolvedValue(fullyCached(hoursAgo(1)));

    await revalidateStoredLicense(mockVerifyRemote);

    // Re-checking on every read would put a www round-trip in front of every
    // sponsor-gated action; the stored verifiedAt bounds how often we ask.
    expect(mockVerifyRemote).not.toHaveBeenCalled();
  });

  it('re-checks once the stored verification has aged past the interval', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(REVALIDATE_INTERVAL_MS / 3600_000 + 1)));
    mockVerifyRemote.mockResolvedValue({ valid: true, status: 'active' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockVerifyRemote).toHaveBeenCalledWith('CCG-abc');
  });

  it('refreshes verifiedAt when the key is still active, so the next check waits again', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    mockVerifyRemote.mockResolvedValue({ valid: true, status: 'active' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockSaveLicense).toHaveBeenCalledWith({
      licenseKey: 'CCG-abc',
      status: 'active',
      verifiedAt: NOW.toISOString(),
      tier: null,
      interval: null,
      price: null,
      cancellable: null,
    });
    expect(mockClearLicense).not.toHaveBeenCalled();
  });

  it('picks up a plan change (tier/interval) reported by the re-check', async () => {
    mockReadLicense.mockResolvedValue({
      ...storedLicense(hoursAgo(999)),
      tier: 'jetbrains',
      interval: 'monthly',
    });
    mockVerifyRemote.mockResolvedValue({
      valid: true,
      status: 'active',
      tier: 'allround',
      interval: 'yearly',
    });

    await revalidateStoredLicense(mockVerifyRemote);

    // An upgrade or a switch to yearly should surface without the sponsor
    // having to re-enter their key.
    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'allround', interval: 'yearly' }),
    );
  });

  it('keeps the cached plan when the re-check does not mention it', async () => {
    mockReadLicense.mockResolvedValue({
      ...storedLicense(hoursAgo(999)),
      tier: 'jetbrains',
      interval: 'monthly',
    });
    mockVerifyRemote.mockResolvedValue({ valid: true, status: 'active' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'jetbrains', interval: 'monthly' }),
    );
  });

  it('re-reports this install on a successful check, so its device label stays current', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    mockVerifyRemote.mockResolvedValue({ valid: true, status: 'active' });

    await revalidateStoredLicense(mockVerifyRemote);

    // Installs activated before device labels existed would otherwise sit
    // nameless in the sponsor's own list forever.
    expect(mockReportActivation).toHaveBeenCalledWith('CCG-abc');
  });

  it('does not re-report when the key turned out to be invalid', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    mockVerifyRemote.mockResolvedValue({ valid: false, status: 'refunded' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockReportActivation).not.toHaveBeenCalled();
  });

  it('clears the license when www authoritatively says the key is no longer valid', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    // A refund/cancellation flips the row to refunded/expired → valid:false.
    mockVerifyRemote.mockResolvedValue({ valid: false, status: 'refunded' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockClearLicense).toHaveBeenCalledTimes(1);
  });

  it('does NOT revoke sponsorship when the check fails for a network reason', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    // verifyLicenseRemote reports transport failures as valid:false + error.
    // Treating that as "not a sponsor" would strip a paying user offline.
    mockVerifyRemote.mockResolvedValue({ valid: false, error: 'fetch failed' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockClearLicense).not.toHaveBeenCalled();
  });

  it('does NOT revoke sponsorship when the verifier throws', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(999)));
    mockVerifyRemote.mockRejectedValue(new Error('boom'));

    await expect(revalidateStoredLicense(mockVerifyRemote)).resolves.toBeUndefined();
    expect(mockClearLicense).not.toHaveBeenCalled();
  });

  it('re-checks immediately when the plan details have never been cached', async () => {
    // A license stored before tier/interval existed has a fresh verifiedAt but no
    // plan to show. Waiting a full interval would leave the sponsor screen blank
    // for a day, so a missing plan counts as reason enough to ask now.
    mockReadLicense.mockResolvedValue(storedLicense(hoursAgo(1)));
    mockVerifyRemote.mockResolvedValue({
      valid: true,
      status: 'active',
      tier: 'jetbrains',
      interval: 'monthly',
    });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockVerifyRemote).toHaveBeenCalledWith('CCG-abc');
    expect(mockSaveLicense).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'jetbrains', interval: 'monthly' }),
    );
  });

  it('does not re-check on every read once the plan is cached', async () => {
    mockReadLicense.mockResolvedValue(fullyCached(hoursAgo(1)));

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockVerifyRemote).not.toHaveBeenCalled();
  });

  it('re-checks when verifiedAt is missing or unparseable rather than trusting it forever', async () => {
    mockReadLicense.mockResolvedValue(storedLicense(''));
    mockVerifyRemote.mockResolvedValue({ valid: true, status: 'active' });

    await revalidateStoredLicense(mockVerifyRemote);

    expect(mockVerifyRemote).toHaveBeenCalledWith('CCG-abc');
  });
});
