import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

export interface CloudflaredInfo {
  installed: boolean;
  /** Null when it is not installed, or is there but did not report a readable version. */
  version: string | null;
}

interface RawResult {
  status?: string;
  cloudflaredAvailable?: boolean;
  cloudflaredVersion?: string | null;
}

/** Its own cache entry: the tunnel modal asks the same message without the version. */
const QUERY_KEY = [MessageType.GET_TUNNEL_PREREQS, 'version'];

/**
 * Which cloudflared the tunnel would run, for the Dependencies list in About.
 *
 * Read-only: cloudflared is installed by the tunnel when it is first turned on, so there is
 * nothing to install or update from here, only a version to report and re-check.
 */
export function useCloudflaredVersion() {
  const { send, isConnected } = useBridgeContext();

  const query = useQuery<CloudflaredInfo>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const r = (await send(MessageType.GET_TUNNEL_PREREQS, { version: true })) as RawResult;
      return { installed: r.cloudflaredAvailable ?? false, version: r.cloudflaredVersion ?? null };
    },
    enabled: isConnected,
  });

  return {
    info: query.data,
    loading: query.isLoading,
    refresh: useCallback(() => query.refetch(), [query]),
    refreshing: query.isFetching,
  };
}
