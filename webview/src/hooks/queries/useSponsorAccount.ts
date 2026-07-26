import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/** One machine this sponsor key is active on. */
export interface SponsorDevice {
  /** Install id — also the handle used to sign the device out. */
  telemetryId: string | null;
  claudeEmail: string | null;
  /** Human-readable label, e.g. "MacBook Pro · macOS". */
  deviceName: string | null;
  activatedAt: string | null;
  /** True for the machine the user is on right now (resolved backend-side). */
  isCurrent: boolean;
}

/** One payment behind the license, with its provider-hosted receipt. */
export interface SponsorInvoice {
  id: string;
  paidAt: string | null;
  /** Amount in the smallest currency unit (e.g. cents). */
  total: number | null;
  currency: string | null;
  status: string | null;
  receiptUrl: string | null;
}

/**
 * Sponsor self-service data for Settings > Sponsor: where the license is active
 * and what was paid.
 *
 * Both lists are supporting detail, so a failure resolves to an empty list
 * rather than an error state — the backend already degrades that way when www or
 * the payment provider is unreachable, and the screen stays usable either way.
 *
 * Only fetched when the user actually is a sponsor: for everyone else these
 * requests would return nothing and just add round-trips to a screen that is
 * showing them a pitch.
 */
export function useSponsorDevices(enabled: boolean): UseQueryResult<SponsorDevice[], Error> {
  const { isConnected, send } = useBridgeContext();
  return useQuery<SponsorDevice[], Error>({
    queryKey: [MessageType.GET_SPONSOR_DEVICES],
    enabled: enabled && isConnected,
    queryFn: async () => {
      const res = (await send(MessageType.GET_SPONSOR_DEVICES)) as { devices?: SponsorDevice[] } | null;
      return Array.isArray(res?.devices) ? res.devices : [];
    },
  });
}

export function useSponsorInvoices(enabled: boolean): UseQueryResult<SponsorInvoice[], Error> {
  const { isConnected, send } = useBridgeContext();
  return useQuery<SponsorInvoice[], Error>({
    queryKey: [MessageType.GET_SPONSOR_INVOICES],
    enabled: enabled && isConnected,
    queryFn: async () => {
      const res = (await send(MessageType.GET_SPONSOR_INVOICES)) as { invoices?: SponsorInvoice[] } | null;
      return Array.isArray(res?.invoices) ? res.invoices : [];
    },
  });
}

/** Sign one machine out, then refresh the list so the row disappears. */
export function useRemoveSponsorDevice(): (telemetryId: string) => Promise<void> {
  const { send } = useBridgeContext();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (telemetryId: string) => {
      await send(MessageType.REMOVE_SPONSOR_DEVICE, { telemetryId });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_SPONSOR_DEVICES] });
    },
  });

  return useCallback(
    async (telemetryId: string) => {
      await mutation.mutateAsync(telemetryId);
    },
    [mutation],
  );
}
