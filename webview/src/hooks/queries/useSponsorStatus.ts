import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

interface SponsorStatusResponse {
  status?: string;
  isSponsor?: boolean;
  licenseKey?: string;
  licenseStatus?: string;
  /** Paid tier, cached backend-side from the last verification. */
  tier?: string;
  /** Billing cadence ("monthly" | "yearly"), cached alongside the tier. */
  interval?: string;
  error?: string;
}

interface VerifyResponse {
  valid?: boolean;
  licenseStatus?: string;
  error?: string;
}

interface SponsorState {
  isSponsor: boolean;
  licenseKey: string | null;
  licenseStatus: string | null;
  tier: string | null;
  interval: string | null;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface UseSponsorStatusResult {
  isSponsor: boolean;
  licenseKey: string | null;
  licenseStatus: string | null;
  /** Paid tier, when the server knows it. */
  tier: string | null;
  /** Billing cadence ("monthly" | "yearly"), when resolved. */
  interval: string | null;
  isLoading: boolean;
  verify: (licenseKey: string) => Promise<VerifyResult>;
  deactivate: () => Promise<void>;
  /** Poll www for a sponsor key minted for this install and auto-activate it. */
  checkByInstall: () => Promise<void>;
}

function useSponsorStatusQuery(): UseQueryResult<SponsorState, Error> {
  const { isConnected, send } = useBridgeContext();
  return useQuery<SponsorState, Error>({
    queryKey: [MessageType.GET_SPONSOR_STATUS],
    enabled: isConnected,
    queryFn: async () => {
      const res = (await send(MessageType.GET_SPONSOR_STATUS)) as SponsorStatusResponse;
      if (res?.status === 'ok') {
        return {
          isSponsor: res.isSponsor === true,
          licenseKey: res.licenseKey ?? null,
          licenseStatus: res.licenseStatus ?? null,
          tier: res.tier ?? null,
          interval: res.interval ?? null,
        };
      }
      throw new Error(res?.error ?? 'Failed to load sponsor status');
    },
  });
}

/**
 * Sponsor entitlement for the Settings > Sponsor section: reads the stored
 * status and exposes verify/deactivate actions that re-fetch it. Verifying a key
 * is a backend round-trip to www; on success the backend persists the key and
 * this query reflects the new sponsor state after invalidation.
 */
export function useSponsorStatus(): UseSponsorStatusResult {
  const { send } = useBridgeContext();
  const queryClient = useQueryClient();
  const query = useSponsorStatusQuery();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_SPONSOR_STATUS] });
  }, [queryClient]);

  const verify = useCallback(
    async (licenseKey: string): Promise<VerifyResult> => {
      const res = (await send(MessageType.VERIFY_LICENSE, { licenseKey })) as VerifyResponse;
      if (res?.valid === true) {
        invalidate();
        return { valid: true };
      }
      return { valid: false, error: res?.error };
    },
    [send, invalidate],
  );

  const deactivate = useCallback(async () => {
    await send(MessageType.DEACTIVATE_LICENSE);
    invalidate();
  }, [send, invalidate]);

  const checkByInstall = useCallback(async () => {
    const res = (await send(MessageType.CHECK_SPONSOR)) as { isSponsor?: boolean } | null;
    if (res?.isSponsor === true) invalidate();
  }, [send, invalidate]);

  return {
    isSponsor: query.data?.isSponsor ?? false,
    licenseKey: query.data?.licenseKey ?? null,
    licenseStatus: query.data?.licenseStatus ?? null,
    tier: query.data?.tier ?? null,
    interval: query.data?.interval ?? null,
    isLoading: query.isLoading,
    verify,
    deactivate,
    checkByInstall,
  };
}
