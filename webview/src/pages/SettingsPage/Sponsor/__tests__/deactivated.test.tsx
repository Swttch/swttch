import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

// Someone who switched sponsorship off on this device looks exactly like a
// first-time visitor to the old screen: no entitlement, no key. That is the
// worst possible confusion, because their subscription may still be charging
// them and the menu that cancels it only renders for an active sponsor.
let mockDeactivatedAt: string | null = null;
const mockCheckByInstall = vi.fn();

vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({
    isSponsor: false,
    licenseKey: null,
    licenseStatus: null,
    tier: null,
    interval: null,
    price: null,
    cancellable: false,
    deactivatedAt: mockDeactivatedAt,
    cancelSubscription: vi.fn(),
    isLoading: false,
    verify: vi.fn(),
    deactivate: vi.fn(),
    checkByInstall: mockCheckByInstall,
  }),
}));

const mockSend = vi.fn();
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: mockSend, isConnected: true }),
}));
vi.mock('@/hooks/queries/useAccounts', () => ({
  useAccounts: () => ({ activeEmail: 'user@example.com' }),
}));
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openUrl: vi.fn() }) }));

import { SponsorSettings } from '../index';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

const noticeHeading = () =>
  screen.queryByRole('heading', { name: /switched off on this device/i });

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ url: 'https://example.test/pricing' });
  mockCheckByInstall.mockReset().mockResolvedValue(false);
  mockDeactivatedAt = null;
});

describe('SponsorSettings — a device the user switched off', () => {
  it('says nothing extra to someone who never sponsored', () => {
    render(<SponsorSettings />, { wrapper });

    expect(noticeHeading()).toBeNull();
  });

  it('tells a switched-off device what happened', () => {
    mockDeactivatedAt = '2026-09-01T00:00:00.000Z';

    render(<SponsorSettings />, { wrapper });

    expect(noticeHeading()).not.toBeNull();
  });

  // The whole reason the notice exists: silence here means someone keeps paying
  // while the screen invites them to start paying.
  it('warns that billing was not cancelled', () => {
    mockDeactivatedAt = '2026-09-01T00:00:00.000Z';

    render(<SponsorSettings />, { wrapper });

    expect(screen.getByText(/did not cancel anything/i)).toBeInTheDocument();
  });

  // Cancelling lives behind Manage, which only an active sponsor sees. So the
  // honest route out has to be signposted from here.
  it('points at how to actually stop the recurring payment', () => {
    mockDeactivatedAt = '2026-09-01T00:00:00.000Z';

    render(<SponsorSettings />, { wrapper });

    expect(screen.getByText(/Cancel recurring sponsorship/i)).toBeInTheDocument();
  });

  it('offers a way back on, and takes it', async () => {
    mockDeactivatedAt = '2026-09-01T00:00:00.000Z';
    const user = userEvent.setup();

    render(<SponsorSettings />, { wrapper });
    await user.click(screen.getByRole('button', { name: /switch it back on/i }));

    await waitFor(() => expect(mockCheckByInstall).toHaveBeenCalledTimes(1));
  });

  // A stored stamp we cannot parse must not take the notice down with it — the
  // warning matters more than the date it carries.
  it('still shows the notice when the stamp is unparseable', () => {
    mockDeactivatedAt = 'not-a-date';

    render(<SponsorSettings />, { wrapper });

    expect(noticeHeading()).not.toBeNull();
  });
});
