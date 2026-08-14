import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

export interface ExtendKitInfo {
  /** npm package name, so the UI never has to spell it out itself. */
  packageName: string;
  /** Version installed on this machine, or null when it is not installed. */
  installed: string | null;
  /** Latest published version, or null when the registry was unreachable. */
  latest: string | null;
  /** A newer version exists and can be installed over the current one. */
  updatable: boolean;
}

interface RawResult extends Partial<ExtendKitInfo> {
  status?: string;
  error?: string;
}

/**
 * The kit's installed/latest versions, plus the one action that changes them.
 *
 * Voice input needs the kit, so its settings section is inert until the kit is
 * there — which makes "is it installed, and is it current" part of the section's
 * own state rather than something to discover by trying to record and failing.
 *
 * `install` doubles as update: `npm i -g` fetches the latest either way, so a
 * missing kit and an outdated one take the same path.
 */
export function useExtendKit() {
  const { send, isConnected } = useBridgeContext();
  const queryClient = useQueryClient();

  const query = useQuery<ExtendKitInfo>({
    queryKey: [MessageType.GET_EXTEND_KIT_INFO],
    queryFn: async () => {
      const r = (await send(MessageType.GET_EXTEND_KIT_INFO, {})) as RawResult;
      return {
        packageName: r.packageName ?? '',
        installed: r.installed ?? null,
        latest: r.latest ?? null,
        updatable: r.updatable ?? false,
      };
    },
    enabled: isConnected,
    // Checking the registry runs `npm view`, which is slow enough to be worth
    // not repeating every time the settings screen is opened.
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.INSTALL_CCB, {})) as RawResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to install the kit');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_EXTEND_KIT_INFO] });
      // The usage panel reads the same package, so a fresh install fixes it too.
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
    },
  });

  return {
    info: query.data,
    loading: query.isLoading,
    install: useCallback(() => mutation.mutateAsync(), [mutation]),
    installing: mutation.isPending,
  };
}
