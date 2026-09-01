import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useBridge } from './useBridge';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType, McpServerConfig, McpServerTool } from '@/shared';

/**
 * Fetch one MCP server's tool list on demand (used by the server detail view).
 *
 * The backend connects to the server via the MCP SDK and runs the standard
 * `tools/list` — there is no `claude` CLI command for this. We pass the server's
 * `config` (already known from the list) so the backend doesn't re-run
 * `claude mcp get`. Only enabled for connected, probeable servers.
 *
 * `workingDir` goes along because the backend spawns the server with the
 * workspace's own config files layered in, so the same server can resolve a
 * `${VAR}` differently per project. The query key carries it for that reason.
 */
export function useMcpServerTools(
  name: string,
  config: McpServerConfig | null,
  enabled: boolean,
): UseQueryResult<McpServerTool[], Error> {
  const { send } = useBridge();
  const { workingDirectory } = useWorkingDir();
  const workingDir = workingDirectory ?? undefined;

  return useQuery({
    queryKey: ['mcp-tools', name, workingDirectory],
    enabled: enabled && config !== null,
    queryFn: async () => {
      const res = await send<{ status: string; tools?: McpServerTool[]; error?: string }>(
        MessageType.GET_MCP_SERVER_TOOLS,
        { name, config, workingDir },
      );
      if (res.status === 'ok') return res.tools ?? [];
      throw new Error(res.error ?? 'Failed to load tools');
    },
    // A server's tools rarely change between reconnects, so cache briefly to
    // avoid re-connecting every time the user re-opens the same detail view.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}
