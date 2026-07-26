import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

// The auto-activation poll asks www for a key minted for this install. It exists
// for one moment only — right after the user paid in the browser — so these tests
// pin WHEN it runs. Polling whenever the screen is open makes Deactivate a no-op,
// because the same key is fetched straight back.
const mockCheckByInstall = vi.fn();
const mockDeactivate = vi.fn();
const mockVerify = vi.fn();
let mockIsSponsor = false;

vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({
    isSponsor: mockIsSponsor,
    licenseKey: mockIsSponsor ? 'CCG-abcd1234' : null,
    licenseStatus: null,
    tier: mockIsSponsor ? 'jetbrains' : null,
    interval: mockIsSponsor ? 'monthly' : null,
    isLoading: false,
    verify: mockVerify,
    deactivate: mockDeactivate,
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

const mockOpenUrl = vi.fn();
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openUrl: mockOpenUrl }),
}));

import { SponsorSettings } from '../index';

// The sponsor sections fetch devices/invoices through react-query.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
  );
}

describe('SponsorSettings — auto-activation polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCheckByInstall.mockReset().mockResolvedValue(undefined);
    mockDeactivate.mockReset().mockResolvedValue(undefined);
    mockVerify.mockReset().mockResolvedValue({ valid: true });
    mockSend.mockReset().mockResolvedValue({ url: 'https://example.test/pricing' });
    mockOpenUrl.mockReset().mockResolvedValue(undefined);
    mockIsSponsor = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('does NOT poll just because the screen is open', async () => {
    render(<SponsorSettings />, { wrapper });

    await advance(30_000);

    // This is the regression that made Deactivate useless: an idle non-sponsor
    // sitting on this screen kept re-fetching the key minted for their install.
    expect(mockCheckByInstall).not.toHaveBeenCalled();
  });

  it('starts polling once the user opens the checkout page', async () => {
    render(<SponsorSettings />, { wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /learn more/i }));
    });

    await advance(5_000);
    expect(mockCheckByInstall).toHaveBeenCalled();
  });

  it('stops polling after the activation window closes', async () => {
    render(<SponsorSettings />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /learn more/i }));
    });

    await advance(10 * 60_000 + 1_000);
    const callsAfterWindow = mockCheckByInstall.mock.calls.length;

    await advance(60_000);

    // Left running forever, the poll would silently restore a key the user
    // deactivated later in the same session.
    expect(mockCheckByInstall.mock.calls.length).toBe(callsAfterWindow);
  });

  it('does not poll after deactivating, even though the user is now a non-sponsor', async () => {
    mockIsSponsor = true;
    const { rerender } = render(<SponsorSettings />, { wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /deactivate|해제/i }));
    });
    // The query flips to non-sponsor after deactivation.
    mockIsSponsor = false;
    rerender(<SponsorSettings />);

    await advance(30_000);

    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockCheckByInstall).not.toHaveBeenCalled();
  });
});
