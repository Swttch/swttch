import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

export interface CcbInstallHint {
  command: string;
  shells: string[];
}

interface RawHint {
  status?: string;
  command?: string;
  shells?: string[];
}

// Shown if the backend is unreachable, so the notice always has something copyable.
const FALLBACK: CcbInstallHint = { command: 'npm install -g @swttch/extend-kit', shells: [] };

/**
 * GET_CCB_INSTALL_HINT query — the platform-correct install command + shells for
 * the not-installed notice (win32 → `npm.cmd` + [Command Prompt, PowerShell, Git
 * Bash], unix → `npm` + [Terminal]). The backend owns this because the right
 * command depends on the OS it runs on. Cached for the session (platform is fixed).
 */
export function useCcbInstallHint(): CcbInstallHint {
  const { isConnected, send } = useBridgeContext();
  const query = useQuery<CcbInstallHint, Error>({
    queryKey: [MessageType.GET_CCB_INSTALL_HINT],
    enabled: isConnected,
    staleTime: Infinity,
    queryFn: async () => {
      const r = (await send(MessageType.GET_CCB_INSTALL_HINT)) as RawHint;
      if (r?.status === 'ok' && typeof r.command === 'string') {
        return { command: r.command, shells: Array.isArray(r.shells) ? r.shells : [] };
      }
      throw new Error('Failed to load ccb install hint');
    },
  });
  return query.data ?? FALLBACK;
}
