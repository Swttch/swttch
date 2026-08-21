import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
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
 * Whether the NEXT request should make the backend re-resolve from scratch.
 *
 * Module scope, not a ref, because several components call this hook (the voice
 * section, its version control, the composer's install prompt) while react-query
 * keeps ONE cache entry for them all — and runs exactly one of their queryFn
 * closures. A per-instance ref set by the control that was clicked is therefore
 * routinely read by a different instance's closure, which sees `false`, and the
 * backend keeps answering from its own cache. Measured exactly that: the kit was
 * gone from disk and the version line kept showing it.
 *
 * One flag for one shared query entry, consumed by whichever closure runs.
 */
let forceRefreshNextFetch = false;

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
export function useExtendKit(options?: { enabled?: boolean }) {
  const { send, isConnected } = useBridgeContext();
  const queryClient = useQueryClient();

  const query = useQuery<ExtendKitInfo>({
    queryKey: [MessageType.GET_EXTEND_KIT_INFO],
    queryFn: async () => {
      const refresh = forceRefreshNextFetch;
      forceRefreshNextFetch = false;
      const r = (await send(MessageType.GET_EXTEND_KIT_INFO, { refresh })) as RawResult;
      return {
        packageName: r.packageName ?? '',
        installed: r.installed ?? null,
        latest: r.latest ?? null,
        updatable: r.updatable ?? false,
      };
    },
    // Callers that only need the info conditionally (the composer, which asks
    // only while its "install the kit" prompt is up) pass enabled:false to keep
    // this off the wire until it matters.
    enabled: isConnected && (options?.enabled ?? true),
    // Checking the registry runs `npm view`, which is slow enough to be worth
    // not repeating every time the settings screen is opened.
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      // Installing downloads + links; wait as long as the backend does (180s +
      // margin) so a slow install's result reaches us instead of a silent stall.
      const r = (await send(MessageType.INSTALL_CCB, {}, { timeout: INSTALL_REQUEST_TIMEOUT_MS })) as RawResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to install the kit');
    },
    onSuccess: () => {
      // Installing is finished; what the section should now SHOW is the version
      // lookup's job, not this mutation's. So hand straight over to the very
      // path the version control runs when it is clicked — same flag, same
      // invalidation — instead of keeping a second notion of "installed" here
      // that could disagree with the one the rest of the section reads.
      //
      // Whatever the backend cached about where the kit is (including having
      // found none) is stale the moment this succeeds, so the refetch has to
      // make it look again.
      forceRefreshNextFetch = true;
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_EXTEND_KIT_INFO] });
      // The usage panel reads the same package, so a fresh install fixes it too.
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
    },
  });

  // Removing goes through the same manager that installed, decided backend-side
  // — see uninstallCcb.ts. Both caches it invalidates are the ones install
  // invalidates, so the section returns to its not-installed state on its own.
  const removal = useMutation<void, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.UNINSTALL_CCB, {}, { timeout: INSTALL_REQUEST_TIMEOUT_MS })) as RawResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to remove the kit');
    },
    onSuccess: () => {
      // The refetch this triggers must re-resolve on the backend too: the kit
      // that was just removed is exactly what its cache still points at.
      forceRefreshNextFetch = true;
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_EXTEND_KIT_INFO] });
      // The usage panel reads the same package, so removing it changes that too.
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
    },
  });

  return {
    info: query.data,
    loading: query.isLoading,
    install: useCallback(() => mutation.mutateAsync(), [mutation]),
    installing: mutation.isPending,
    uninstall: useCallback(() => removal.mutateAsync(), [removal]),
    uninstalling: removal.isPending,
    // Ask again now, ignoring staleTime AND the backend's own resolution cache.
    // The answer can change without this app doing anything — the kit may be
    // installed, updated or removed in a terminal — and a cache that is the
    // right default for opening the screen is the wrong one at the moment
    // someone deliberately asks to re-check.
    refresh: useCallback(() => {
      forceRefreshNextFetch = true;
      return query.refetch();
    }, [query]),
    refreshing: query.isFetching,
  };
}
