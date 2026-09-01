/**
 * Ask a LIVE Claude CLI what MCP servers it currently has.
 *
 * Why this exists, next to the `claude mcp list` path in mcp-manager:
 *
 * 1. It answers the question the panel actually asks. `claude mcp list` spawns a
 *    fresh CLI that probes every server from scratch, so what the panel showed
 *    was one process's opinion while the user's chat was talking to another. A
 *    server that died after the chat connected still read "Connected", and a
 *    server the chat holds fine read "Failed" whenever the fresh probe missed.
 *    Asking the running CLI removes that disagreement by construction.
 *
 * 2. It stops spawning. Every `claude mcp list` / `claude mcp get` boots a CLI
 *    that starts every stdio server again, and a server run as `docker run -i
 *    --rm ...` leaves its container behind when that CLI dies (#363). Asking a
 *    CLI that is already running starts nothing.
 *
 * 3. One reply carries what three mechanisms used to gather: status (from `mcp
 *    list`), scope (from `mcp get`), and tools (from our own MCP SDK connection).
 *
 * This rides the same stdin control channel the backend already drives for
 * `interrupt`, `set_model` and the whole `can_use_tool` permission flow. The
 * `mcp_status` subtype is not documented, so it is used strictly as the fast
 * path: every failure here returns null and the caller falls back to the official
 * `claude mcp list`, which stays the guaranteed route.
 *
 * Using it at all is a DELIBERATE EXCEPTION to the "no dependence on unofficial
 * support" principle in CLAUDE.md, which names this very case as forbidden. The
 * principle stands; the exception, why it was granted and the conditions that
 * withdraw it are recorded in
 * `docs/principle-exceptions/363-mcp-status-control-request.md`. Read that before
 * widening what this module relies on.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { sendControlRequestToProcess } from '../claude-process';
import {
  nextControlRequestId,
  waitForControlResponse,
  cancelControlResponse,
} from '../control-response-waiter';
import { McpServerScope, McpServerStatus } from '../../shared';
import type { McpServer, McpServerConfig, McpServerInfo, McpServerTool } from '../../shared';

/**
 * How long to wait for a running CLI to answer.
 *
 * Short on purpose. The process is already up and the reply is local, so a slow
 * answer means the CLI is wedged rather than busy, and waiting longer only
 * delays the fallback that would have worked. Measured round trip on a healthy
 * CLI with nine servers: well under a second.
 */
const MCP_STATUS_TIMEOUT_MS = 8_000;

/**
 * One server as the CLI reports it (measured against CLI 2.1.x).
 *
 * Field names are the CLI's own; nothing is renamed on the way through
 * (original-data preservation, CLAUDE.md).
 */
export interface McpStatusEntry {
  name: string;
  /** Machine word: "connected" | "failed" | "needs-auth" | "pending" | "disabled". */
  status?: string;
  /** Machine word: "user" | "project" | "local" | "claudeai" | "managed" | "enterprise". */
  scope?: string;
  config?: McpServerConfig;
  serverInfo?: McpServerInfo;
  tools?: McpServerTool[];
}

interface McpStatusResponse {
  mcpServers?: McpStatusEntry[];
}

/**
 * The MCP servers a live CLI for `workingDir` reports, or null when there is no
 * live CLI to ask, or it did not answer, or it answered with something this does
 * not recognise. Null always means "use the official CLI command instead".
 */
export async function fetchMcpStatus(
  connections: ConnectionManager,
  workingDir?: string,
): Promise<McpStatusEntry[] | null> {
  // No workspace means no way to tell which CLI holds the right project config,
  // so there is nothing safe to reuse.
  if (!workingDir) return null;

  const session = connections.findLiveSessionForWorkingDir(workingDir);
  if (!session) return null;

  const requestId = nextControlRequestId('mcp_status');
  const waiting = waitForControlResponse<McpStatusResponse>(requestId, MCP_STATUS_TIMEOUT_MS);
  const written = sendControlRequestToProcess(connections, session.sessionId, requestId, {
    subtype: 'mcp_status',
  });
  if (!written) {
    cancelControlResponse(requestId);
    // Settle the abandoned waiter here, so it neither lingers nor surfaces as an
    // unhandled rejection. Nothing was sent, so there is nothing to report.
    await waiting.catch(() => undefined);
    return null;
  }

  try {
    const response = await waiting;
    const servers = response?.mcpServers;
    return Array.isArray(servers) ? servers : null;
  } catch (err) {
    console.error(
      '[node-backend]',
      `mcp_status unavailable, falling back to \`claude mcp list\`: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/**
 * Map the CLI's entries onto the list shape the WebView already renders.
 *
 * Pure, so the mapping is testable without a CLI. The status and scope words the
 * CLI uses are the same strings our enums are built from, so this validates
 * membership rather than translating: an unknown word is kept as-is for scope
 * (the list still groups by it) and treated as FAILED for status, which is the
 * same conservative choice the text parser makes — never show a connected badge
 * for a state we did not understand.
 */
export function toMcpServers(entries: McpStatusEntry[]): McpServer[] {
  return entries.map((entry) => ({
    name: entry.name,
    status: toStatus(entry.status),
    scope: toScope(entry.scope),
    config: entry.config ?? null,
    // Present, so the detail view knows the tool list is already answered and
    // does not open its own connection to ask again. An empty array here means
    // "asked, none", which is a different fact from "not asked yet" (undefined).
    tools: entry.tools ?? [],
    // The CLI reports no message alongside a failure here; the status itself is
    // the whole of what it knows. URL-backed servers get a real reason added
    // afterwards by the probe in mcp-manager.
    error: null,
    serverInfo: entry.serverInfo,
  }));
}

const STATUS_VALUES = new Set<string>(Object.values(McpServerStatus));
const SCOPE_VALUES = new Set<string>(Object.values(McpServerScope));

function toStatus(raw?: string): McpServerStatus {
  return raw && STATUS_VALUES.has(raw) ? (raw as McpServerStatus) : McpServerStatus.FAILED;
}

function toScope(raw?: string): McpServerScope | string {
  if (!raw) return '';
  return SCOPE_VALUES.has(raw) ? (raw as McpServerScope) : raw;
}
