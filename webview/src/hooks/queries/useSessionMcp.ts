import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

export interface SessionMcpInfo {
  /** npm package name, so the UI never has to spell it out itself. */
  packageName: string;
  /** Version installed on this machine, or null when it is not installed. */
  installed: string | null;
  /** Latest published version, or null when the registry was unreachable. */
  latest: string | null;
  /** A newer version exists and can be installed over the current one. */
  updatable: boolean;
  /**
   * The backend is bringing an installed package up to the latest release by itself. While this
   * holds there is nothing to press; `updatable` without it means that attempt already failed.
   */
  updating: boolean;
}

interface RawResult extends Partial<SessionMcpInfo> {
  status?: string;
  error?: string;
}

/** Whether the next lookup should make the backend re-resolve from disk; one flag for the one shared query entry. */
let forceRefreshNextFetch = false;

/**
 * The session-management MCP's installed/latest versions, and the actions that change them.
 *
 * Shaped after `useExtendKit`: the package is installed by the user from the settings screen,
 * never by anything on its own. Once installed, the backend keeps it current by itself and says
 * so with `SESSION_MCP_UPDATED`. `install` doubles as the manual update.
 */
export function useSessionMcp(options?: { enabled?: boolean }) {
  const { send, subscribe, isConnected } = useBridgeContext();
  const queryClient = useQueryClient();

  useEffect(() => subscribe(MessageType.SESSION_MCP_UPDATED, () => {
    forceRefreshNextFetch = true;
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_SESSION_MCP_INFO] });
  }), [subscribe, queryClient]);

  const query = useQuery<SessionMcpInfo>({
    queryKey: [MessageType.GET_SESSION_MCP_INFO],
    queryFn: async () => {
      const refresh = forceRefreshNextFetch;
      forceRefreshNextFetch = false;
      const r = (await send(MessageType.GET_SESSION_MCP_INFO, { refresh })) as RawResult;
      return {
        packageName: r.packageName ?? '',
        installed: r.installed ?? null,
        latest: r.latest ?? null,
        updatable: r.updatable ?? false,
        updating: r.updating ?? false,
      };
    },
    enabled: isConnected && (options?.enabled ?? true),
    // Checking the registry runs `npm view`, which is slow enough not to repeat on every visit.
    staleTime: 5 * 60 * 1000,
  });

  const refreshAfterChange = () => {
    forceRefreshNextFetch = true;
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_SESSION_MCP_INFO] });
  };

  const installation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.INSTALL_SESSION_MCP, {}, { timeout: INSTALL_REQUEST_TIMEOUT_MS })) as RawResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to install the session-management MCP');
    },
    onSuccess: refreshAfterChange,
  });

  const removal = useMutation<void, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.UNINSTALL_SESSION_MCP, {}, { timeout: INSTALL_REQUEST_TIMEOUT_MS })) as RawResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to remove the session-management MCP');
    },
    onSuccess: refreshAfterChange,
  });

  return {
    info: query.data,
    loading: query.isLoading,
    failed: query.isError,
    install: useCallback(() => installation.mutateAsync(), [installation]),
    installing: installation.isPending,
    uninstall: useCallback(() => removal.mutateAsync(), [removal]),
    uninstalling: removal.isPending,
    refresh: useCallback(() => {
      forceRefreshNextFetch = true;
      return query.refetch();
    }, [query]),
    refreshing: query.isFetching,
  };
}
