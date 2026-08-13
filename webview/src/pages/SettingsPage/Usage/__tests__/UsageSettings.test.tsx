import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageSettings } from '../index';

vi.mock('@/hooks/queries/useAllUsage', () => ({
  useAllUsage: vi.fn(),
}));

// CcbNotInstalledNotice now pulls INSTALL_CCB via useInstallCcb (BridgeContext +
// QueryClient); stub it so the render test needs no providers.
vi.mock('@/hooks/queries/useInstallCcb', () => ({
  useInstallCcb: () => ({ install: vi.fn(), installing: false }),
}));

vi.mock('@/hooks/queries/useCcbInstallHint', () => ({
  useCcbInstallHint: () => ({ command: 'npm install -g @swttch/extend-kit', shells: [] }),
}));

vi.mock('@/router/routes', () => ({
  ROUTE_META: { SETTINGS_USAGE: { label: 'Usage' } },
  Route: { SETTINGS_USAGE: 'SETTINGS_USAGE' },
}));

import { useAllUsage } from '@/hooks/queries/useAllUsage';

const mockAccounts = [
  {
    id: 'acc-1',
    emailAddress: 'user1@example.com',
    displayName: 'User 1',
    subscriptionType: 'max',
    active: true,
    usage: {
      five_hour: { utilization: 10, resets_at: '2026-12-01T00:00:00Z' },
      seven_day: null,
      seven_day_sonnet: null,
      seven_day_opus: null,
    },
    error: null,
    errorKind: null,
  },
  {
    id: 'acc-2',
    emailAddress: 'user2@example.com',
    displayName: 'User 2',
    subscriptionType: 'pro',
    active: false,
    usage: null,
    error: 'credentials are unavailable',
    errorKind: 'auth',
  },
];

describe('UsageSettings', () => {
  it('renders neither notice nor error box when there is no error', () => {
    vi.mocked(useAllUsage).mockReturnValue({
      accounts: [mockAccounts[0]],
      isLoading: false,
      error: null,
      lastUpdated: new Date(),
      refetch: vi.fn(),
      refresh: vi.fn(),
    });

    render(<UsageSettings />);

    expect(screen.getByText('USER1@EXAMPLE.COM')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText(/A required dependency/i)).toBeNull();
    expect(screen.queryByText(/Usage unavailable/i)).toBeNull();
  });

  it('renders CcbNotInstalledNotice when errorKind is ccb_missing', () => {
    vi.mocked(useAllUsage).mockReturnValue({
      accounts: [
        {
          id: 'acc-1',
          emailAddress: 'user1@example.com',
          displayName: 'User 1',
          subscriptionType: 'max',
          active: true,
          usage: null,
          error: 'The ccb CLI is not installed',
          errorKind: 'ccb_missing',
        },
      ],
      isLoading: false,
      error: null,
      lastUpdated: null,
      refetch: vi.fn(),
      refresh: vi.fn(),
    });

    render(<UsageSettings />);

    expect(screen.getByText(/A required dependency/i)).toBeInTheDocument();
    expect(screen.getByText('npm install -g @swttch/extend-kit')).toBeInTheDocument();
  });

  it('renders per-account error box when errorKind is not ccb_missing', () => {
    vi.mocked(useAllUsage).mockReturnValue({
      accounts: mockAccounts,
      isLoading: false,
      error: null,
      lastUpdated: null,
      refetch: vi.fn(),
      refresh: vi.fn(),
    });

    render(<UsageSettings />);

    expect(screen.getByText('USER2@EXAMPLE.COM')).toBeInTheDocument();
    expect(screen.getByText('Usage unavailable: credentials are unavailable')).toBeInTheDocument();
  });

  it('renders global query error when query fails', () => {
    vi.mocked(useAllUsage).mockReturnValue({
      accounts: [],
      isLoading: false,
      error: 'Failed to load usage info',
      lastUpdated: null,
      refetch: vi.fn(),
      refresh: vi.fn(),
    });

    render(<UsageSettings />);

    expect(screen.getByText('Failed to load usage info')).toBeInTheDocument();
  });
});
