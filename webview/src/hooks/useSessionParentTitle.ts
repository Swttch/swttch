import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { useSessionScope } from './useSessionAssets';

interface ParentTitleResponse {
  status?: string;
  title?: string;
}

/**
 * The title of the Claude Desktop session that started the current session, or undefined when there is none to
 * show: Desktop did not start it, Desktop's files are not on this machine, or the starter has no title.
 *
 * Asked only when `enabled`, which the caller sets for the first message of a session another session started:
 * every other session has no starter to look up.
 */
export function useSessionParentTitle(enabled: boolean): string | undefined {
  const { send } = useBridgeContext();
  const { sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-parent-title', sessionId],
    enabled: enabled && Boolean(sessionId),
    staleTime: Infinity,
    queryFn: async (): Promise<string | null> => {
      const res = await send<ParentTitleResponse>(MessageType.GET_SESSION_PARENT_TITLE, { sessionId });
      return res?.status === 'ok' && typeof res.title === 'string' ? res.title : null;
    },
  });

  return data ?? undefined;
}
