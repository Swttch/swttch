import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getMcpServers } from '../features/mcp-manager';

/**
 * GET_MCP_SERVERS — list all MCP servers with status, scope, config and tools.
 *
 * Data sources, in order:
 *   1. `mcp_status` asked of a CLI already running for this workspace, which is
 *      why `connections` is handed down: it is where that CLI is found.
 *   2. `claude mcp list` + `claude mcp get <name>`, the official commands, used
 *      whenever no live CLI can answer.
 *   3. disabledMcpServers in ~/.claude.json (disabled state), applied to both.
 */
export async function getMcpServersHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    // Run the CLI in the user's workspace root so project-scope (.mcp.json)
    // servers resolve from the right place, matching the chat session's cwd.
    const workingDir = (message.payload as { workingDir?: string })?.workingDir;
    const result = await getMcpServers(workingDir, connections);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      servers: result.servers,
      configPath: result.configPath,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
