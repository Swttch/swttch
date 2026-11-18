import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/** What Claude Desktop's own file says about one of its sessions; a field is absent when the file has none. */
export interface DesktopSession {
  title?: string;
  /** The CLI session it runs: the id this app's own sessions are named by. */
  cliSessionId?: string;
  /** The folder it works in. */
  cwd?: string;
  isArchived?: boolean;
  lastActivityAt?: number;
  /** Whether it stopped to wait for the person. */
  awaitingPerson?: boolean;
  /** The desktop app deleted the session: it has no file any more, only the mark of its deletion. */
  deleted?: boolean;
}

interface DesktopSessionResponse {
  status?: string;
  session?: DesktopSession;
}

/** The key under which what is known of one desktop session is kept; the whole family of keys starts with the first part. */
export const DESKTOP_SESSION_KEY = 'desktop-session';

/** How long what was read of a desktop session is trusted before a screen asks again. */
export const DESKTOP_SESSION_STALE_MS = 60_000;

/** One read of a desktop session's own record, or null when there is none. Shared by every screen that asks. */
export async function readDesktopSession(
  send: <T = unknown>(type: string, payload?: Record<string, unknown>) => Promise<T>,
  desktopSessionId: string,
): Promise<DesktopSession | null> {
  const res = await send<DesktopSessionResponse>(MessageType.GET_DESKTOP_SESSION, { desktopSessionId });
  return res?.status === 'ok' && res.session ? res.session : null;
}

/**
 * A Claude Desktop session named by its Desktop id (`local_…`), or undefined when it is not known (yet):
 * Desktop's files are not on this machine, or there is no file for it. Asked only when `enabled`.
 *
 * What a chat shows of the sessions its text points at is held in one place, see `BacklinkedSessionsContext`;
 * this is the read that place is made of, and what a screen outside it uses.
 */
export function useDesktopSession(desktopSessionId: string, enabled: boolean = true): DesktopSession | undefined {
  const { send } = useBridgeContext();

  const { data } = useQuery({
    queryKey: [DESKTOP_SESSION_KEY, desktopSessionId],
    enabled: enabled && desktopSessionId.startsWith('local_'),
    staleTime: DESKTOP_SESSION_STALE_MS,
    queryFn: () => readDesktopSession(send, desktopSessionId),
  });

  return data ?? undefined;
}
