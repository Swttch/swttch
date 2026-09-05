import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type AccountListItem, type AccountPool, type AccountsResult } from '@/shared';

interface RawAccountsResponse {
  status?: string;
  accounts?: AccountListItem[];
  accountPools?: AccountPool[];
  activeEmail?: string | null;
  error?: string | null;
}

/**
 * Saved Claude accounts for the multi-account switcher.
 *
 * Reads GET_ACCOUNTS (the list + which one is live) and exposes save/switch/delete
 * actions. Each action invalidates both `[GET_ACCOUNTS]` (this list) and
 * `[GET_ACCOUNT]` (the single-account Profile/auth state) so the whole UI reflects
 * the change. An ACCOUNTS_CHANGED push (e.g. a switch from another window) does the
 * same invalidation.
 */
export interface UseAccountsResult {
  accounts: AccountListItem[];
  accountPools: AccountPool[];
  activeEmail: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  save: () => Promise<void>;
  switchTo: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  savePools: (accountPools: AccountPool[]) => Promise<void>;
}

function useAccountsQuery(): UseQueryResult<AccountsResult, Error> {
  const { isConnected, send } = useBridgeContext();
  return useQuery<AccountsResult, Error>({
    queryKey: [MessageType.GET_ACCOUNTS],
    enabled: isConnected,
    // Event-only refresh: inherit the global staleTime:Infinity /
    // refetchOnWindowFocus:false / refetchOnReconnect:false. In the IDE, window
    // focus fires on every editor<->tool-window<->webview switch, so a focus
    // refetch flooded the backend with GET_ACCOUNTS. GUI account actions
    // (save/switch/delete) and cross-window changes both broadcast
    // ACCOUNTS_CHANGED, which invalidates this query — so the list and active
    // marker still update instantly. The only case not caught is an external
    // `claude` login switch in the terminal, which surfaces on the next GUI
    // account action rather than in real time.
    queryFn: async () => {
      const result = (await send(MessageType.GET_ACCOUNTS)) as RawAccountsResponse;
      if (result?.status === 'ok') {
        return {
          accounts: result.accounts ?? [],
          accountPools: result.accountPools ?? [],
          activeEmail: result.activeEmail ?? null,
        };
      }
      throw new Error(result?.error ?? 'Failed to load accounts');
    },
  });
}

export function useAccounts(): UseAccountsResult {
  const { send, subscribe } = useBridgeContext();
  const queryClient = useQueryClient();
  const query = useAccountsQuery();

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_ACCOUNTS] });
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE_REPORT] });
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_ALL_USAGE] });
  }, [queryClient]);

  // Refetch when any window changes the registry or switches the live account.
  useEffect(() => {
    const unsubscribe = subscribe(MessageType.ACCOUNTS_CHANGED, () => invalidateAll());
    return unsubscribe;
  }, [subscribe, invalidateAll]);

  const runAction = useCallback(
    async (type: MessageType, payload?: Record<string, unknown>) => {
      const result = (await send(type, payload)) as { status?: string; error?: string };
      if (result?.status !== 'ok') {
        throw new Error(result?.error ?? 'Account action failed');
      }
      invalidateAll();
    },
    [send, invalidateAll],
  );

  const save = useCallback(() => runAction(MessageType.SAVE_ACCOUNT), [runAction]);
  const switchTo = useCallback((id: string) => runAction(MessageType.SWITCH_ACCOUNT, { id }), [runAction]);
  const remove = useCallback((id: string) => runAction(MessageType.DELETE_ACCOUNT, { id }), [runAction]);
  // Applied to the cache before the backend is asked, then confirmed by the
  // refetch that `runAction` triggers. Pools are rearranged by dragging, and a
  // drag has to land somewhere the instant it is dropped: waiting for the round
  // trip leaves the old arrangement on screen long enough for the drag library
  // to animate the row back into the slot it just left, which then vanishes when
  // the answer arrives. On failure the cache is put back and the error surfaces
  // as it did before.
  const savePools = useCallback(
    async (accountPools: AccountPool[]) => {
      const previous = queryClient.getQueryData<AccountsResult>([MessageType.GET_ACCOUNTS]);
      if (previous) {
        queryClient.setQueryData<AccountsResult>([MessageType.GET_ACCOUNTS], { ...previous, accountPools });
      }
      try {
        await runAction(MessageType.UPDATE_ACCOUNT_POOLS, { accountPools });
      } catch (err) {
        if (previous) queryClient.setQueryData<AccountsResult>([MessageType.GET_ACCOUNTS], previous);
        throw err;
      }
    },
    [runAction, queryClient],
  );

  return {
    accounts: query.data?.accounts ?? [],
    accountPools: query.data?.accountPools ?? [],
    activeEmail: query.data?.activeEmail ?? null,
    isLoading: query.isLoading,
    error: query.isError ? (query.error?.message ?? 'Unknown error') : null,
    refetch: query.refetch,
    save,
    switchTo,
    remove,
    savePools,
  };
}
