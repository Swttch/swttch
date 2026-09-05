import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, ErrorCode } from '@/shared';

interface SponsorStatusResponse {
  status?: string;
  isSponsor?: boolean;
  licenseKey?: string;
  licenseStatus?: string;
  /** Paid tier, cached backend-side from the last verification. */
  tier?: string;
  /** Billing cadence ("monthly" | "yearly"), cached alongside the tier. */
  interval?: string;
  /** List price of the plan, e.g. { amount: 5, currency: "USD" }. */
  price?: SponsorPrice;
  /** Whether a recurring payment exists that could be cancelled. */
  cancellable?: boolean;
  /** Set only when this device switched sponsorship off; ISO 8601. */
  deactivatedAt?: string;
  error?: string;
}

/** What a sponsor pays. */
export interface SponsorPrice {
  /** Whole units of the currency (e.g. 5 for $5). */
  amount: number;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
}

interface VerifyResponse {
  valid?: boolean;
  licenseStatus?: string;
  error?: string;
  /** Which kind of failure this was — see ErrorCode. Absent on success. */
  errorCode?: ErrorCode;
}

interface SponsorState {
  isSponsor: boolean;
  licenseKey: string | null;
  licenseStatus: string | null;
  tier: string | null;
  interval: string | null;
  price: SponsorPrice | null;
  cancellable: boolean;
  deactivatedAt: string | null;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
  /**
   * Which kind of failure this was, so the caller can say something true about
   * it. A key we could not check is NOT a key we know to be wrong.
   */
  errorCode?: ErrorCode;
}

export interface UseSponsorStatusResult {
  isSponsor: boolean;
  licenseKey: string | null;
  licenseStatus: string | null;
  /** Paid tier, when the server knows it. */
  tier: string | null;
  /** Billing cadence ("monthly" | "yearly"), when resolved. */
  interval: string | null;
  /** List price of the plan, when known. */
  price: SponsorPrice | null;
  /** Whether there is a recurring payment that can be cancelled. */
  cancellable: boolean;
  /**
   * When this device switched sponsorship off, or null if it never did. Tells a
   * past sponsor apart from a first-time visitor — their screens are otherwise
   * identical, while the first one may still be paying.
   */
  deactivatedAt: string | null;
  /** End the recurring payment (not the same as clearing the local key). */
  cancelSubscription: () => Promise<boolean>;
  isLoading: boolean;
  verify: (licenseKey: string) => Promise<VerifyResult>;
  deactivate: () => Promise<void>;
  /**
   * Ask www for a sponsor key minted for this install and activate it here.
   * Also lifts an earlier deactivation, because it only runs when the user asked
   * for sponsorship on this device. Resolves to whether a key is now active.
   */
  checkByInstall: () => Promise<boolean>;
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
          price: res.price ?? null,
          cancellable: res.cancellable === true,
          deactivatedAt: res.deactivatedAt ?? null,
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
      // An older backend (or a dropped ACK) sends no errorCode; fall back to
      // treating it as an invalid key, which is the message this screen showed
      // for every failure before the two kinds were told apart.
      return {
        valid: false,
        error: res?.error,
        errorCode: res?.errorCode ?? ErrorCode.SPONSOR_KEY_INVALID,
      };
    },
    [send, invalidate],
  );

  const deactivate = useCallback(async () => {
    await send(MessageType.DEACTIVATE_LICENSE);
    invalidate();
  }, [send, invalidate]);

  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    const res = (await send(MessageType.CANCEL_SPONSOR_SUBSCRIPTION)) as { ok?: boolean } | null;
    // The provider cancels at period end, so entitlement does not change yet;
    // refetch anyway so any status the webhook already flipped shows up.
    invalidate();
    return res?.ok === true;
  }, [send, invalidate]);

  const checkByInstall = useCallback(async (): Promise<boolean> => {
    const res = (await send(MessageType.CHECK_SPONSOR)) as { isSponsor?: boolean } | null;
    // Always refetch, not only on success: this call also lifts an earlier
    // deactivation, so even when no key comes back the screen has changed from
    // "you switched this off" to "not sponsoring yet" and must be redrawn.
    invalidate();
    return res?.isSponsor === true;
  }, [send, invalidate]);

  return {
    isSponsor: query.data?.isSponsor ?? false,
    licenseKey: query.data?.licenseKey ?? null,
    licenseStatus: query.data?.licenseStatus ?? null,
    tier: query.data?.tier ?? null,
    interval: query.data?.interval ?? null,
    price: query.data?.price ?? null,
    cancellable: query.data?.cancellable ?? false,
    deactivatedAt: query.data?.deactivatedAt ?? null,
    cancelSubscription,
    isLoading: query.isLoading,
    verify,
    deactivate,
    checkByInstall,
  };
}
