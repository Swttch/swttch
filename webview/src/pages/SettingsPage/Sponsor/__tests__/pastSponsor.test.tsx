import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

// Entitlement and identity are separate facts here, so the two are mocked
// independently: `isSponsor` is what is unlocked today, `licenseKey` is whether
// this install has ever been activated. A past sponsor is the combination that
// used to be impossible — no entitlement, but a key.
let mockIsSponsor = false;
let mockLicenseKey: string | null = null;
let mockLicenseStatus: string | null = null;

vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({
    isSponsor: mockIsSponsor,
    licenseKey: mockLicenseKey,
    licenseStatus: mockLicenseStatus,
    tier: mockLicenseKey !== null ? 'jetbrains' : null,
    interval: mockLicenseKey !== null ? 'monthly' : null,
    price: mockLicenseKey !== null ? { amount: 5, currency: 'USD' } : null,
    cancellable: false,
    deactivatedAt: null,
    cancelSubscription: vi.fn(),
    isLoading: false,
    verify: vi.fn(),
    deactivate: vi.fn(),
    checkByInstall: vi.fn(),
  }),
}));

const mockSend = vi.fn();
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: mockSend, isConnected: true }),
}));

vi.mock('@/hooks/queries/useAccounts', () => ({
  useAccounts: () => ({ activeEmail: 'user@example.com' }),
}));

vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openUrl: vi.fn() }),
}));

import { SponsorSettings } from '../index';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

/** The invitation shown to anyone who is not currently sponsoring. */
function invitationShown(): boolean {
  return screen.queryByRole('button', { name: /sponsor|후원/i }) !== null;
}

/**
 * The payment-history section. Matched on its own heading rather than a loose
 * text search, which also hits the "Payments" tab label an active sponsor sees.
 */
function billingShown(): boolean {
  return screen.queryByRole('heading', { name: 'Payments' }) !== null;
}

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ url: 'https://example.test/pricing', invoices: [] });
  mockIsSponsor = false;
  mockLicenseKey = null;
  mockLicenseStatus = null;
});

describe('SponsorSettings — what a lapsed sponsor keeps', () => {
  it('a never-sponsored user sees the invitation and no billing history', () => {
    render(<SponsorSettings />, { wrapper });

    expect(invitationShown()).toBe(true);
    expect(billingShown()).toBe(false);
  });

  // The point of the whole change: entitlement ended, but the record that they
  // paid did not. Deleting the key would have taken their receipts with it.
  it.each(['expired', 'refunded'])(
    'a %s sponsor still sees their billing history',
    (status) => {
      mockIsSponsor = false;
      mockLicenseKey = 'CCG-abcd1234';
      mockLicenseStatus = status;

      render(<SponsorSettings />, { wrapper });

      expect(billingShown()).toBe(true);
    },
  );

  // Re-starting a sponsorship is the same act as starting one, so it gets the
  // same screen rather than a diminished "you used to sponsor" variant.
  it('a lapsed sponsor is invited back with the ordinary invitation', () => {
    mockIsSponsor = false;
    mockLicenseKey = 'CCG-abcd1234';
    mockLicenseStatus = 'expired';

    render(<SponsorSettings />, { wrapper });

    expect(invitationShown()).toBe(true);
  });

  it('an active sponsor is not pitched to', () => {
    mockIsSponsor = true;
    mockLicenseKey = 'CCG-abcd1234';
    mockLicenseStatus = 'active';

    render(<SponsorSettings />, { wrapper });

    expect(invitationShown()).toBe(false);
  });
});
