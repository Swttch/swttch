import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { AccountPoolStrategy, MessageType } from '@/shared';
import { createTestQueryClient, makeQueryWrapper } from './testQueryClient';

const { mockSend, mockSubscribe } = vi.hoisted(() => ({ mockSend: vi.fn(), mockSubscribe: vi.fn() }));
let connected = true;
// Captured ACCOUNTS_CHANGED handler so the test can simulate a push.
let changedHandler: (() => void) | null = null;

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: connected, send: mockSend, subscribe: mockSubscribe, lastError: null }),
}));

import { useAccounts, type UseAccountsResult } from '../useAccounts';

const sample = {
  status: 'ok',
  accounts: [
    { id: 'acc-1', emailAddress: 'a@x.com', displayName: null, organizationName: null, subscriptionType: 'team', authMethod: 'claudeai', createdAt: 1, updatedAt: 2, active: true },
  ],
  accountPools: [],
  activeEmail: 'a@x.com',
};

let current: UseAccountsResult | null = null;
function Probe() {
  current = useAccounts();
  return null;
}

function renderHook() {
  const client = createTestQueryClient();
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  render(<Probe />, { wrapper: makeQueryWrapper(client) });
  return { invalidateSpy };
}

describe('useAccounts', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSubscribe.mockReset();
    // focusManager is a global singleton; restore system default so focus state
    // never leaks between tests.
    focusManager.setFocused(undefined);
    connected = true;
    current = null;
    changedHandler = null;
    mockSubscribe.mockImplementation((type: string, handler: () => void) => {
      if (type === MessageType.ACCOUNTS_CHANGED) changedHandler = handler;
      return () => undefined;
    });
  });

  it('loads the saved accounts and active email from GET_ACCOUNTS', async () => {
    mockSend.mockResolvedValue(sample);
    renderHook();
    await waitFor(() => expect(current?.accounts.length).toBe(1));
    expect(current?.activeEmail).toBe('a@x.com');
    expect(current?.accountPools).toEqual([]);
    expect(mockSend.mock.calls.filter((c) => c[0] === MessageType.GET_ACCOUNTS).length).toBe(1);
  });

  it('switchTo sends SWITCH_ACCOUNT with the id and invalidates both account queries', async () => {
    mockSend.mockResolvedValue(sample);
    const { invalidateSpy } = renderHook();
    await waitFor(() => expect(current).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.switchTo('acc-2'); });

    expect(mockSend).toHaveBeenCalledWith(MessageType.SWITCH_ACCOUNT, { id: 'acc-2' });
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain(MessageType.GET_ACCOUNTS);
    expect(keys).toContain(MessageType.GET_ACCOUNT);
  });

  it('save sends SAVE_ACCOUNT, remove sends DELETE_ACCOUNT, and savePools sends UPDATE_ACCOUNT_POOLS', async () => {
    mockSend.mockResolvedValue(sample);
    renderHook();
    await waitFor(() => expect(current).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.save(); });
    expect(mockSend).toHaveBeenCalledWith(MessageType.SAVE_ACCOUNT, undefined);

    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.remove('acc-1'); });
    expect(mockSend).toHaveBeenCalledWith(MessageType.DELETE_ACCOUNT, { id: 'acc-1' });

    const accountPools = [{
      id: 'pool-1',
      name: 'Pool',
      provider: 'claude' as const,
      enabled: true,
      strategy: AccountPoolStrategy.ORDERED,
      accountIds: ['acc-1', 'acc-2'],
      createdAt: 1,
      updatedAt: 1,
    }];
    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.savePools(accountPools); });
    expect(mockSend).toHaveBeenCalledWith(MessageType.UPDATE_ACCOUNT_POOLS, { accountPools });
  });

  // A drag has to land the instant it is dropped. If the new arrangement only
  // appeared after the backend answered, the old slot would still be on screen
  // and the drag library would animate the row back into it before the answer
  // arrived — the row visibly returning to a pool it had just been pulled out of.
  describe('savePools shows the new arrangement before the backend answers', () => {
    const pools = [{
      id: 'pool-1',
      name: 'Pool',
      provider: 'claude' as const,
      enabled: true,
      strategy: AccountPoolStrategy.ORDERED,
      accountIds: ['acc-1', 'acc-2'],
      createdAt: 1,
      updatedAt: 1,
    }];

    it('applies the pools while the request is still in flight', async () => {
      mockSend.mockResolvedValue(sample);
      renderHook();
      await waitFor(() => expect(current?.accountPools).toEqual([]));

      let release: (value: { status: string }) => void = () => undefined;
      mockSend.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

      let pending: Promise<void> = Promise.resolve();
      act(() => { pending = current!.savePools(pools); });

      // Still waiting on the backend, and the pools are already on screen.
      await waitFor(() => expect(current?.accountPools).toEqual(pools));

      await act(async () => { release({ status: 'ok' }); await pending; });
      expect(current?.accountPools).toEqual(pools);
    });

    it('puts the previous pools back when the request fails', async () => {
      mockSend.mockResolvedValue(sample);
      renderHook();
      await waitFor(() => expect(current?.accountPools).toEqual([]));

      let release: (value: { status: string; error: string }) => void = () => undefined;
      mockSend.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

      let pending: Promise<void> = Promise.resolve();
      act(() => { pending = current!.savePools(pools).catch(() => undefined); });

      // The optimistic value must actually be on screen first, otherwise the
      // "rolled back" assertion below would hold even with no rollback at all.
      await waitFor(() => expect(current?.accountPools).toEqual(pools));

      await act(async () => { release({ status: 'error', error: 'disk full' }); await pending; });
      await waitFor(() => expect(current?.accountPools).toEqual([]));
    });

    it('reports the failure to the caller', async () => {
      mockSend.mockResolvedValue(sample);
      renderHook();
      await waitFor(() => expect(current).not.toBeNull());

      mockSend.mockResolvedValueOnce({ status: 'error', error: 'disk full' });
      await expect(current!.savePools(pools)).rejects.toThrow(/disk full/);
    });
  });

  it('throws when an action returns a non-ok status', async () => {
    mockSend.mockResolvedValue(sample);
    renderHook();
    await waitFor(() => expect(current).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'error', error: 'keychain locked' });
    await expect(current!.switchTo('acc-2')).rejects.toThrow(/keychain locked/);
  });

  it('does not refetch GET_ACCOUNTS on window focus (event-only policy)', async () => {
    mockSend.mockResolvedValue(sample);
    renderHook();
    await waitFor(() => expect(current?.accounts.length).toBe(1));
    const countGetAccounts = () =>
      mockSend.mock.calls.filter((c) => c[0] === MessageType.GET_ACCOUNTS).length;
    expect(countGetAccounts()).toBe(1);

    // Simulate the IDE window regaining focus. With the event-only policy
    // (staleTime:Infinity / refetchOnWindowFocus:false) this must NOT refetch.
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });

    expect(countGetAccounts()).toBe(1);
  });

  it('refetches both account queries on an ACCOUNTS_CHANGED push', async () => {
    mockSend.mockResolvedValue(sample);
    const { invalidateSpy } = renderHook();
    await waitFor(() => expect(changedHandler).not.toBeNull());

    invalidateSpy.mockClear();
    act(() => { changedHandler?.(); });

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain(MessageType.GET_ACCOUNTS);
    expect(keys).toContain(MessageType.GET_ACCOUNT);
  });
});
