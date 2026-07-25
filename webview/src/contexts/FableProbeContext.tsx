import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { isFableSupportedCli, toModelAlias } from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';

/** ACK payload shape for a PROBE_FABLE_AVAILABILITY request (see the backend
 *  `probeFableAvailability` handler). `available` is only present on success. */
interface FableProbeResponse {
  status: 'ok' | 'error';
  available?: boolean;
  checkedAt?: number;
  fromCache?: boolean;
  error?: string;
}

interface FableProbeContextValue {
  /** null = not yet determined; true/false = whether THIS account can still
   *  select Fable (per the real per-account availability probe). Feeds the 4th
   *  arg of `withFableFallback`, which only offers Fable post-promo when true. */
  probedAvailable: boolean | null;
  /** Fire the backend probe and store the result. Never throws: a transient
   *  failure or an error status leaves the prior value untouched (null until a
   *  probe resolves), so a hiccup can neither falsely offer nor falsely hide
   *  Fable. Mirrors `useTelemetryConsent`'s request/response consumption. */
  probeFableAvailability: (workingDir?: string) => Promise<void>;
}

const FableProbeContext = createContext<FableProbeContextValue | null>(null);

interface Props {
  children: ReactNode;
}

/**
 * App-level, single-instance store for the Fable availability probe result.
 *
 * A shared provider (mounted once) is what lets all three picker consumers — the
 * model overlay, the composer model tag, and the command-palette switch item —
 * read the same `probedAvailable` value, so Fable appears/hides consistently
 * across them once the probe resolves.
 */
export function FableProbeProvider(props: Props) {
  const { children } = props;
  const { send } = useBridgeContext();
  const [probedAvailable, setProbedAvailable] = useState<boolean | null>(null);

  const probeFableAvailability = useCallback(
    async (workingDir?: string) => {
      try {
        const res = (await send(MessageType.PROBE_FABLE_AVAILABILITY, { workingDir })) as FableProbeResponse | null;
        // Only a definitive success updates state. On error/status!==ok we keep
        // the prior value (null until determined) so a flaky probe never toggles
        // Fable's visibility.
        if (res?.status === 'ok' && typeof res.available === 'boolean') {
          setProbedAvailable(res.available);
        }
      } catch {
        // Swallow: keep `probedAvailable` as-is (null = still undetermined).
      }
    },
    [send],
  );

  return (
    <FableProbeContext.Provider value={{ probedAvailable, probeFableAvailability }}>
      {children}
    </FableProbeContext.Provider>
  );
}

export function useFableProbe(): FableProbeContextValue {
  const context = useContext(FableProbeContext);
  if (!context) {
    throw new Error('useFableProbe must be used within a FableProbeProvider');
  }
  return context;
}

/**
 * Whether the model picker should fire the availability probe on open.
 *
 * The probe is a real (paid, but cached) `--model fable` call, so we only run it
 * when it can actually change the outcome. Mirrors `withFableFallback`'s gate
 * shape so the trigger and the fallback never disagree:
 *  - empty catalog → still loading, don't probe (we can't yet tell if the CLI
 *    will serve Fable natively);
 *  - old CLI → can't select Fable at all, so nothing to confirm;
 *  - catalog already serves Fable → the dynamic entry wins, no fallback needed.
 * Otherwise (supported CLI, Fable absent) a probe decides whether to offer the
 * fallback for this account.
 */
export function shouldProbeFable(
  rawModels: ModelInfo[],
  cliVersion: string | null | undefined,
): boolean {
  if (rawModels.length === 0) return false;
  if (!isFableSupportedCli(cliVersion)) return false;
  if (rawModels.some((m) => toModelAlias(m.value) === 'fable')) return false;
  return true;
}
