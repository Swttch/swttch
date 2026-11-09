import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { useSessionScope } from './useSessionAssets';

interface ParentResponse {
  status?: string;
  title?: string;
  isArchived?: boolean;
}

/** What Claude Desktop's own file says about the session that started this one; a field is absent when the file has none. */
export interface SessionParent {
  title?: string;
  isArchived?: boolean;
}

/**
 * The Claude Desktop session that started the current session, or undefined when there is none to show.
 * Asked only when `enabled`, which the caller sets for the first message of a session another session started.
 * The same question `useSessionParentTitle` asks, with the starter's archived state as well.
 */
export function useSessionParent(enabled: boolean): SessionParent | undefined {
  const { send } = useBridgeContext();
  const { sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-parent', sessionId],
    enabled: enabled && Boolean(sessionId),
    staleTime: 60_000,
    queryFn: async (): Promise<SessionParent | null> => {
      const res = await send<ParentResponse>(MessageType.GET_SESSION_PARENT_TITLE, { sessionId });
      if (res?.status !== 'ok') return null;
      return {
        ...(typeof res.title === 'string' && { title: res.title }),
        ...(typeof res.isArchived === 'boolean' && { isArchived: res.isArchived }),
      };
    },
  });

  return data ?? undefined;
}
