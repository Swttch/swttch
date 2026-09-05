import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AccountListItem, AccountPool, AccountPoolStrategy } from '@/shared';

const mockNavigate = vi.fn();
const fixtures = vi.hoisted(() => {
  function account(id: string, emailAddress: string, active: boolean): AccountListItem {
    return {
      id,
      emailAddress,
      displayName: 'Yonghyun',
      organizationName: null,
      subscriptionType: 'max',
      authMethod: 'claudeai',
      createdAt: 1,
      updatedAt: 1,
      usageCached: null,
      usageCachedAt: 0,
      active,
    };
  }

  function pool(id: string, accountIds: string[]): AccountPool {
    return {
      id,
      name: 'Account Pool 1',
      provider: 'claude',
      enabled: true,
      strategy: 'ordered' as AccountPoolStrategy,
      accountIds,
      createdAt: 1,
      updatedAt: 1,
    };
  }

  return {
    accounts: [
      account('acc-1', 'fred@01republic.io', true),
      account('acc-2', 'yhk1038@gmail.com', false),
      account('acc-3', 'solo@example.com', false),
    ],
    accountPools: [pool('pool-1', ['acc-1', 'acc-2'])],
  };
});

vi.mock('@/router/useRouter', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

vi.mock('@/hooks/queries/useAccounts', () => ({
  useAccounts: () => ({
    accounts: fixtures.accounts,
    accountPools: fixtures.accountPools,
    activeEmail: 'fred@01republic.io',
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    save: vi.fn(),
    switchTo: vi.fn(),
    remove: vi.fn(),
    savePools: vi.fn(),
  }),
}));

import { AccountSettings } from '../index';

describe('AccountSettings account pools', () => {
  it('renders account pools with ordered rows and standalone accounts', () => {
    render(<AccountSettings />);

    expect(screen.getByRole('heading', { name: 'Account & Pool' })).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.queryByText('Account Pools')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Account Pool 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Ordered')).not.toBeInTheDocument();
    expect(screen.queryByText('Automatic switch order')).not.toBeInTheDocument();
    expect(screen.getAllByText('3 accounts')).toHaveLength(1);
    expect(screen.queryByText('2 accounts')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('solo@example.com')).toBeInTheDocument();
  });
});
