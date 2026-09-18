import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type SessionSend } from '@/shared';
import { useSessionScope } from './useSessionAssets';

interface SendsResponse {
  status?: string;
  sends?: SessionSend[];
}

/**
 * Every send the user typed in the current session, whether or not the
 * transcript has loaded that far back.
 *
 * The transcript is paged — 50 entries a page, and in one session measured here
 * 1,281 of 1,345 `user` entries were tool_result plumbing — so a rail built from
 * what is on screen shows a handful of ticks for a conversation with dozens of
 * sends. This index is the whole list, without the entries behind it.
 *
 * Shaped after `useSessionAssets`: one query key per session, a staleTime that
 * survives scrolling back and forth, and rows light enough to ask for eagerly.
 * The heavy part is left where it already lives — the transcript — rather than
 * duplicated here.
 */
export function useSessionSends(enabled: boolean): SessionSend[] | undefined {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-sends', workingDir, sessionId],
    enabled: enabled && Boolean(workingDir && sessionId),
    staleTime: 30_000,
    queryFn: async (): Promise<SessionSend[]> => {
      const res = await send<SendsResponse>(MessageType.GET_SESSION_SENDS, {
        workingDir,
        sessionId,
      });
      return res?.status === 'ok' && Array.isArray(res.sends) ? res.sends : [];
    },
  });

  return data;
}
