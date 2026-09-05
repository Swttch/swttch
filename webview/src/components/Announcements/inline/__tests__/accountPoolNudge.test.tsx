import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, act } from '@testing-library/react';
import type { AccountListItem, AccountPool } from '@/shared';

const { mockUseAccounts, mockOpenSettingsAt } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(),
  mockOpenSettingsAt: vi.fn(),
}));
vi.mock('@/hooks/queries/useAccounts', () => ({ useAccounts: mockUseAccounts }));
vi.mock('@/utils/openSettingsAt', () => ({ openSettingsAt: mockOpenSettingsAt }));

import {
  ACCOUNT_POOL_NUDGE_ID,
  AccountPoolNudgeCard,
  accountPoolNudge,
  useAccountPoolNudgeRelevant,
} from '../accountPoolNudge';
import { readInlineDismissed } from '../dismissed';

function setAccounts(accountCount: number, poolCount: number) {
  mockUseAccounts.mockReturnValue({
    accounts: Array.from({ length: accountCount }, (_, i) => ({ id: `acc-${i}` }) as AccountListItem),
    accountPools: Array.from({ length: poolCount }, (_, i) => ({ id: `pool-${i}` }) as AccountPool),
  });
}

/**
 * Pooling is discovered by dragging one account onto another and holding, which
 * nobody would guess at — hence saying so. It is only worth the space while it
 * is both possible and not already done.
 */
describe('account pool nudge', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseAccounts.mockReset();
  });

  it('is relevant once a second account makes pairing possible', () => {
    setAccounts(2, 0);
    expect(renderHook(() => useAccountPoolNudgeRelevant()).result.current).toBe(true);
  });

  it('is not relevant with a single account, where there is nothing to pair with', () => {
    setAccounts(1, 0);
    expect(renderHook(() => useAccountPoolNudgeRelevant()).result.current).toBe(false);
  });

  it('is not relevant once a pool exists, because the feature has been found', () => {
    setAccounts(3, 1);
    expect(renderHook(() => useAccountPoolNudgeRelevant()).result.current).toBe(false);
  });

  it('stops being relevant the moment it is dismissed, without a reload', () => {
    setAccounts(2, 0);
    const relevance = renderHook(() => useAccountPoolNudgeRelevant());
    expect(relevance.result.current).toBe(true);

    render(<AccountPoolNudgeCard />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /닫기|close/i })); });

    expect(readInlineDismissed(ACCOUNT_POOL_NUDGE_ID)).toBe(true);
    expect(relevance.result.current).toBe(false);
  });

  it('is registered for the empty chat, where a served announcement outranks it', () => {
    expect(accountPoolNudge.id).toBe(ACCOUNT_POOL_NUDGE_ID);
    expect(accountPoolNudge.placement).toBe('EMPTY_STATE');
  });

  // The instructions name a gesture that only works on the accounts screen, so
  // away from it the card offers a way to get there instead of describing
  // something the reader cannot do from where they are.
  describe('the closing line follows where the card is shown', () => {
    beforeEach(() => {
      setAccounts(2, 0);
      mockOpenSettingsAt.mockReset();
    });

    it('spells out the gesture on the screen where it works', () => {
      render(<AccountPoolNudgeCard actionable />);
      expect(screen.getByText(/드래그|drag/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /알아보기|learn more/i })).not.toBeInTheDocument();
    });

    it('offers a way to the accounts screen everywhere else', () => {
      render(<AccountPoolNudgeCard />);
      fireEvent.click(screen.getByRole('button', { name: /알아보기|learn more/i }));
      expect(mockOpenSettingsAt).toHaveBeenCalledWith('settings/account');
    });
  });
});
