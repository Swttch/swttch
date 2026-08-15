import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { MessageType, PackageManager, UpdateMode, type CliUpdateInfo } from '@/shared';

interface RawUpdateInfo extends Partial<CliUpdateInfo> {
  status?: string;
  error?: string;
}

interface RawUpdateResult {
  status?: string;
  newVersion?: string | null;
  error?: string;
}

export interface UseCliUpdateResult {
  info: CliUpdateInfo | null;
  isLoading: boolean;
  updating: boolean;
  /** Run the update (concrete version for VERSIONED, null for SIMPLE). Resolves to the new version. */
  update: (version: string | null) => Promise<string | null>;
}

/**
 * Claude Code CLI update state: reads GET_CLI_UPDATE_INFO (install method +
 * available versions) and runs UPDATE_CLI. A successful update invalidates the
 * shared version query so About + the command palette refresh to the new
 * version, plus this info query so the affordance disappears once up to date.
 */
export function useCliUpdate(): UseCliUpdateResult {
  const { isConnected, send } = useBridgeContext();
  const queryClient = useQueryClient();

  const query = useQuery<CliUpdateInfo, Error>({
    queryKey: [MessageType.GET_CLI_UPDATE_INFO],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_CLI_UPDATE_INFO)) as RawUpdateInfo;
      if (r?.status === 'ok') {
        return {
          cliVersion: r.cliVersion ?? null,
          packageManager: r.packageManager ?? PackageManager.UNKNOWN,
          updateMode: r.updateMode ?? UpdateMode.NONE,
          stable: r.stable ?? null,
          latest: r.latest ?? null,
          updatable: r.updatable ?? false,
        };
      }
      throw new Error(r?.error ?? 'Failed to load CLI update info');
    },
  });

  const mutation = useMutation<string | null, Error, string | null>({
    mutationFn: async (version) => {
      // Updating downloads + links; wait as long as the backend does (180s +
      // margin) so a slow update's result reaches us instead of a silent stall.
      const r = (await send(
        MessageType.UPDATE_CLI,
        version ? { version } : {},
        { timeout: INSTALL_REQUEST_TIMEOUT_MS },
      )) as RawUpdateResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Update failed');
      return r.newVersion ?? null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_VERSION] });
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLI_UPDATE_INFO] });
    },
  });

  const update = useCallback((version: string | null) => mutation.mutateAsync(version), [mutation]);

  return {
    info: query.data ?? null,
    isLoading: query.isLoading,
    updating: mutation.isPending,
    update,
  };
}
