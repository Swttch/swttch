import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type { UsageResponse, UsageErrorKind } from '@/types/usage';
import { MessageType, type ProxySummary } from '@/shared';
import { useUsageQuery, normalizeUsage, type RawUsageResponse } from '@/hooks/queries/useUsageQuery';
import { useTranslation } from '@/i18n';

interface UseUsageDataReturn {
  data: UsageResponse | null;
  isLoading: boolean;
  error: string | null;
  errorKind: UsageErrorKind | null;
  /** The proxy the request goes through, or null when it goes out directly. */
  proxy: ProxySummary | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

export function useUsageData(): UseUsageDataReturn {
  const { t } = useTranslation('settings');
  const { send } = useBridgeContext();
  const queryClient = useQueryClient();
  const { messages } = useChatStreamContext();
  const { workingDirectory } = useWorkingDir();
  const usageQuery = useUsageQuery();

  // Re-fetch on conversation changes (new message, session switch, clear). The
  // shared cache means every useUsageData consumer reacts to one refetch — the
  // old `usage-data-updated` CustomEvent that hand-rolled cross-instance sync is
  // no longer needed.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Explicit refresh bypasses the backend's usage cache (force: true). Write the
  // result straight into the shared cache so all consumers update at once.
  const refresh = useCallback(async () => {
    const result = (await send(MessageType.GET_USAGE, {
      force: true,
      workingDir: workingDirectory ?? undefined,
    })) as RawUsageResponse;
    // Write into THIS project's cache entry (keyed by workingDir), matching useUsageQuery.
    queryClient.setQueryData([MessageType.GET_USAGE, workingDirectory], normalizeUsage(result));
  }, [send, queryClient, workingDirectory]);

  const result = usageQuery.data;
  return {
    data: result?.usage ?? null,
    isLoading: usageQuery.isLoading,
    error: result?.error ?? (usageQuery.isError ? (usageQuery.error?.message ?? t('usage.errors.unknown')) : null),
    errorKind: result?.errorKind ?? null,
    proxy: result?.proxy ?? null,
    lastUpdated: usageQuery.dataUpdatedAt ? new Date(usageQuery.dataUpdatedAt) : null,
    refresh,
  };
}
