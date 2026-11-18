import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useTranslation } from '@/i18n';
import { MessageType, SessionActivity } from '@/shared';
import { LoadedMessageDto } from '@/types';
import { toInstance } from '@/dto/common';
import { sessionActivityLine } from '@/pages/ChatPage/transcript/sessionActivityLine';

interface TailResponse {
  status?: string;
  messages?: Array<Record<string, unknown>>;
}

/** How often the line is read again while the session works: often enough to follow what it does, no more. */
const WHILE_WORKING_MS = 2000;
/**
 * How many of the newest messages are asked for. The call a session is on is among the last few; asking for more makes
 * the backend read and parse more of the end of the record, which holds large lines (a picture a call returned) and is
 * read again every couple of seconds for each card of a session that works.
 */
const TAIL_MESSAGES = 12;

/**
 * What a session is doing at this moment ("Running gh repo view …"), for the card of a session another session
 * started, while the session works; nothing once it does not. It reads the newest entries of the session's record
 * without opening the session, so it neither takes the session over nor needs a screen of its own for it.
 *
 * The line is read again every couple of seconds while the session works. Nothing without a session, or a folder to
 * find its record in.
 */
export function useSessionActivityLine(sessionId: string | undefined, workingDir: string | undefined, doing: SessionActivity): string | undefined {
  const { send } = useBridgeContext();
  const { t } = useTranslation('chat');
  const working = doing === SessionActivity.Running;

  const { data } = useQuery({
    queryKey: ['session-activity-line', workingDir, sessionId, doing],
    // Only while the session works: the desktop app's card says what it is doing then, and nothing once the turn is over.
    enabled: Boolean(sessionId && workingDir) && working,
    staleTime: 0,
    refetchInterval: WHILE_WORKING_MS,
    queryFn: async (): Promise<string | null> => {
      const res = await send<TailResponse>(MessageType.GET_SESSION_TAIL, { workingDir, sessionId, limit: TAIL_MESSAGES });
      if (res?.status !== 'ok' || !Array.isArray(res.messages)) return null;
      const body = res.messages.map((entry) => toInstance(LoadedMessageDto, entry));
      return sessionActivityLine(body, t) ?? null;
    },
  });

  return working ? (data ?? undefined) : undefined;
}
