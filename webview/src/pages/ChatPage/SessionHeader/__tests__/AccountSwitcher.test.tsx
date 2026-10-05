import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AccountListItem } from '@/shared';
import { Route } from '@/router/routes';

const { mockSwitchTo, mockNavigate, mockOpenSettingsAt } = vi.hoisted(() => ({
  mockSwitchTo: vi.fn(),
  mockNavigate: vi.fn(),
  mockOpenSettingsAt: vi.fn(),
}));
let loggedIn: boolean | null = true;
let accounts: AccountListItem[] = [];
let activeEmail: string | null = null;

vi.mock('@/contexts', () => ({ useAuthContext: () => ({ loggedIn, refetch: vi.fn() }) }));
vi.mock('@/router/useRouter', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
vi.mock('@/utils/openSettingsAt', () => ({ openSettingsAt: mockOpenSettingsAt }));
vi.mock('@/hooks/queries/useAccounts', () => ({
  useAccounts: () => ({
    accounts, activeEmail, isLoading: false, error: null, refetch: vi.fn(),
    save: vi.fn(), switchTo: mockSwitchTo, remove: vi.fn(),
  }),
}));

import { AccountSwitcher } from '../AccountSwitcher';

function acc(id: string, email: string, active: boolean, displayName: string | null = null): AccountListItem {
  return {
    id, emailAddress: email, displayName, organizationName: null,
    subscriptionType: 'team', authMethod: 'claudeai', createdAt: 1, updatedAt: 2,
    usageCached: null, usageCachedAt: 0, active,
  };
}

describe('AccountSwitcher', () => {
  beforeEach(() => {
    mockSwitchTo.mockReset();
    mockNavigate.mockReset();
    mockOpenSettingsAt.mockReset();
    loggedIn = true;
    activeEmail = 'bek@x.com';
    accounts = [acc('acc-1', 'bek@x.com', true, 'Bek'), acc('acc-2', 'io@x.com', false, 'IO')];
  });

  it('renders nothing when the user is not logged in', () => {
    loggedIn = false;
    const { container } = render(<AccountSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the active account initials on the avatar button', () => {
    render(<AccountSwitcher />);
    expect(screen.getByText('BE')).toBeInTheDocument();
  });

  it('opens the dropdown and lists saved accounts on click', () => {
    render(<AccountSwitcher />);
    fireEvent.click(screen.getByTitle('Accounts'));
    // 'IO' appears in both the avatar span and the label span; confirm at least one exists.
    expect(screen.getAllByText('IO').length).toBeGreaterThan(0);
    expect(screen.getByText('Add account')).toBeInTheDocument();
    expect(screen.getByText('Manage accounts')).toBeInTheDocument();
  });

  it('switches immediately when a non-active row is clicked', async () => {
    mockSwitchTo.mockResolvedValue(undefined);
    render(<AccountSwitcher />);
    fireEvent.click(screen.getByTitle('Accounts'));
    // 'IO' appears in both avatar and label; click the parent button of either.
    fireEvent.click(screen.getAllByText('IO')[0].closest('button')!);
    await waitFor(() => expect(mockSwitchTo).toHaveBeenCalledWith('acc-2'));
  });

  it('does not switch when the active row is clicked (disabled)', () => {
    render(<AccountSwitcher />);
    fireEvent.click(screen.getByTitle('Accounts'));
    // "Bek" is the active row → its button is disabled, click is a no-op.
    fireEvent.click(screen.getByText('Bek'));
    expect(mockSwitchTo).not.toHaveBeenCalled();
  });

  it('navigates to the login flow from "Add account"', () => {
    render(<AccountSwitcher />);
    fireEvent.click(screen.getByTitle('Accounts'));
    fireEvent.click(screen.getByText('Add account'));
    expect(mockNavigate).toHaveBeenCalled();
  });

  // #493: a bare navigate() dropped backgroundLocation, so Settings opened as a full
  // page and its close button landed on /sessions/new instead of the running session.
  it('opens Settings → Account through openSettingsAt, not a bare navigate', () => {
    render(<AccountSwitcher />);
    fireEvent.click(screen.getByTitle('Accounts'));
    fireEvent.click(screen.getByText('Manage accounts'));
    expect(mockOpenSettingsAt).toHaveBeenCalledWith(Route.SETTINGS_ACCOUNT);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
