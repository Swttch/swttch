import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type { UsageResponse, UsageErrorKind } from '@/types/usage';
import { MessageType } from '@/shared';

/**
 * Structured GET_USAGE result. Unlike GET_ACCOUNT, a non-ok status here carries
 * actionable detail (error + error_kind, e.g. `ccb_missing`) that the UI renders
 * directly, so the queryFn resolves with the full shape instead of throwing.
 */
export interface UsageQueryResult {
  status: string;
  usage: UsageResponse | null;
  error: string | null;
  errorKind: UsageErrorKind | null;
}

export interface RawUsageResponse {
  status?: string;
  usage?: UsageResponse;
  error?: string | null;
  error_kind?: string;
}

const ERROR_KINDS: ReadonlyArray<UsageErrorKind> = [
  'ccb_missing', 'npm_missing', 'auth', 'network', 'rate_limited', 'unknown',
];

function normalizeErrorKind(raw: string | undefined): UsageErrorKind | null {
  return ERROR_KINDS.includes(raw as UsageErrorKind) ? (raw as UsageErrorKind) : null;
}

/** Map a raw GET_USAGE response into the structured query result. Shared by the
 * query's queryFn and the consumer's force-refresh path so both normalize alike. */
export function normalizeUsage(result: RawUsageResponse): UsageQueryResult {
  return {
    status: result?.status ?? 'error',
    usage: result?.usage ?? null,
    error: result?.status === 'ok' ? null : (result?.error ?? 'Failed to fetch usage data'),
    errorKind: result?.status === 'ok' ? null : normalizeErrorKind(result?.error_kind),
  };
}

/**
 * Shared GET_USAGE query. A single cache entry keyed by `[MessageType.GET_USAGE]`
 * means every consumer (the usage panel, any future widget) shares one in-flight
 * request — the previous per-hook fetch fan-out collapses to one call. Refresh
 * and message-driven refetch are done by the consumer via
 * `invalidateQueries({ queryKey: [MessageType.GET_USAGE] })`.
 */
export function useUsageQuery(): UseQueryResult<UsageQueryResult, Error> {
  const { isConnected, send } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();

  // Key by workingDir so each project's usage is cached separately and the request
  // carries its workingDir — the backend resolves CLAUDE_CONFIG_DIR per project. (#123)
  return useQuery<UsageQueryResult, Error>({
    queryKey: [MessageType.GET_USAGE, workingDirectory],
    enabled: isConnected,
    queryFn: async () =>
      normalizeUsage(
        (await send(MessageType.GET_USAGE, {
          force: false,
          workingDir: workingDirectory ?? undefined,
        })) as RawUsageResponse,
      ),
  });
}
