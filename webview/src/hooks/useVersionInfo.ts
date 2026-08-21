import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

interface VersionInfo {
  pluginVersion: string;
  cliVersion: string | null;
  requiresRestart: boolean;
  /** IDE product+version+build, or the browser in standalone mode. Null when unknown. */
  clientInfo: string | null;
  /** OS product name, version and build as resolved by the backend. Null when unknown. */
  osInfo: string | null;
}

interface RawVersionResponse {
  status?: string;
  pluginVersion?: string;
  cliVersion?: string | null;
  requiresRestart?: boolean;
  clientInfo?: string | null;
  osInfo?: string | null;
  error?: string | null;
}

interface UseVersionInfoReturn {
  pluginVersion: string;
  cliVersion: string | null;
  requiresRestart: boolean;
  clientInfo: string | null;
  osInfo: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Plugin + Claude Code CLI version info (GET_VERSION).
 *
 * A single shared React Query (`[GET_VERSION]`) is the one source of truth: About,
 * the command palette footer, and useUpdateAvailable all read the same cache entry,
 * so the version is fetched once and `refresh()` (invalidate) updates every consumer.
 */
export function useVersionInfo(): UseVersionInfoReturn {
  const { isConnected, send } = useBridgeContext();
  const queryClient = useQueryClient();

  const query = useQuery<VersionInfo, Error>({
    queryKey: [MessageType.GET_VERSION],
    enabled: isConnected,
    queryFn: async () => {
      const result = (await send(MessageType.GET_VERSION)) as RawVersionResponse;
      if (result?.status === 'ok') {
        return {
          pluginVersion: result.pluginVersion ?? 'unknown',
          cliVersion: result.cliVersion ?? null,
          requiresRestart: result.requiresRestart ?? true,
          clientInfo: result.clientInfo ?? null,
          osInfo: result.osInfo ?? null,
        };
      }
      throw new Error(result?.error ?? 'Failed to load version info');
    },
  });

  // Invalidate (not refetch) so every consumer of the shared key refetches once —
  // matches the About refresh button and the command-palette version click.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MessageType.GET_VERSION] });
  }, [queryClient]);

  return {
    pluginVersion: query.data?.pluginVersion ?? '...',
    cliVersion: query.data?.cliVersion ?? null,
    requiresRestart: query.data?.requiresRestart ?? true,
    clientInfo: query.data?.clientInfo ?? null,
    osInfo: query.data?.osInfo ?? null,
    // isFetching (not isLoading) so the refresh spinner keeps spinning on manual
    // refetch, not just the very first load. Preserves the prior fetchVersion UX.
    isLoading: query.isFetching,
    refresh,
  };
}
