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
}

interface DesktopSessionResponse {
  status?: string;
  session?: DesktopSession;
}

/**
 * A Claude Desktop session named by its Desktop id (`local_…`), or undefined when it is not known (yet):
 * Desktop's files are not on this machine, or there is no file for it. Asked only when `enabled`.
 */
export function useDesktopSession(desktopSessionId: string, enabled: boolean = true): DesktopSession | undefined {
  const { send } = useBridgeContext();

  const { data } = useQuery({
    queryKey: ['desktop-session', desktopSessionId],
    enabled: enabled && desktopSessionId.startsWith('local_'),
    staleTime: 60_000,
    queryFn: async (): Promise<DesktopSession | null> => {
      const res = await send<DesktopSessionResponse>(MessageType.GET_DESKTOP_SESSION, { desktopSessionId });
      return res?.status === 'ok' && res.session ? res.session : null;
    },
  });

  return data ?? undefined;
}
