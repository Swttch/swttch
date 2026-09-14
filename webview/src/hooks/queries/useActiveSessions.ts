import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridge } from '../useBridge';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType, type ActiveSessionsPayload } from '@/shared';

export const ACTIVE_SESSIONS_QUERY_KEY = ['active-sessions'] as const;

interface AckPayload extends Partial<ActiveSessionsPayload> {
  status: string;
  error?: string;
}

export interface UseActiveSessionsReturn extends ActiveSessionsPayload {
  /** Nothing cached yet, so the panel has only a notice to show. */
  isPending: boolean;
  /** A read is in flight, first or silent. Drives the header spinner. */
  isFetching: boolean;
  error: string | null;
  /** Read the list again now, from the header's refresh button. */
  refresh: () => void;
}

/**
 * The Claude sessions running on this machine right now.
 *
 * Read fresh every time the `@@` panel opens, because this list genuinely goes
 * stale while the composer sits idle: measured twice 34 minutes apart in one
 * sitting, it went from three sessions to four, and the session that appeared
 * was the one the user was looking for. `staleTime: 0` is what makes opening
 * the panel a read.
 *
 * The cached answer is still shown the instant the panel opens, and the fresh
 * one replaces it when it lands — `isPending` covers the first open of a
 * session, `isFetching` every read after it. A panel that went blank while it
 * re-read would flicker on every single open, since every open re-reads.
 */
export function useActiveSessions(enabled: boolean): UseActiveSessionsReturn {
  const { send } = useBridge();
  const queryClient = useQueryClient();
  // Only picks the directory the CLI runs in. The list is machine-wide either
  // way, which is the point: a session in another project is exactly the one
  // worth reaching from here.
  const { workingDirectory } = useWorkingDir();
  const workingDir = workingDirectory ?? undefined;

  const { data, isPending, isFetching, error: queryError } = useQuery({
    queryKey: [...ACTIVE_SESSIONS_QUERY_KEY, workingDirectory] as const,
    queryFn: async (): Promise<ActiveSessionsPayload> => {
      const res = await send<AckPayload>(MessageType.GET_ACTIVE_SESSIONS, { workingDir });
      if (res.status === 'ok') {
        return { agents: res.agents ?? [], entries: res.entries ?? {} };
      }
      throw new Error(res.error ?? 'Failed to list active sessions');
    },
    enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ACTIVE_SESSIONS_QUERY_KEY });
  }, [queryClient]);

  return {
    agents: data?.agents ?? [],
    entries: data?.entries ?? {},
    // A disabled query reports `pending` forever, so only call it pending while
    // the panel is actually asking for something.
    isPending: enabled && isPending,
    isFetching,
    error:
      queryError instanceof Error
        ? queryError.message
        : queryError != null
          ? String(queryError)
          : null,
    refresh,
  };
}
