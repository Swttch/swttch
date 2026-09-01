/**
 * Shared MCP (Model Context Protocol) server management types.
 *
 * NOTE: This file is mirrored 1:1 in `webview/src/shared/mcp.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */

/** Runtime connection status of an MCP server. Source: `claude mcp list/get` or control protocol. */
export enum McpServerStatus {
  CONNECTED = 'connected',
  FAILED = 'failed',
  /** Server requires authentication before it can connect. */
  NEEDS_AUTH = 'needs-auth',
  /** Connection attempt in progress. */
  PENDING = 'pending',
  /** Manually disabled by the user (disabledMcpServers list). Not reported by CLI — derived from config file. */
  DISABLED = 'disabled',
}

/** Config scope the server belongs to. Used as the list grouping key. */
export enum McpServerScope {
  /** ~/.mcp.json or `.mcp.json` in the project root. */
  PROJECT = 'project',
  /** Local project-level config (settings.local.json or .clauderc). */
  LOCAL = 'local',
  /** User-level config in ~/.claude.json. */
  USER = 'user',
  /** Managed by claude.ai (connectors like Gmail, Calendar, Notion). */
  CLAUDEAI = 'claudeai',
  MANAGED = 'managed',
  ENTERPRISE = 'enterprise',
}

/** Transport protocol of the MCP server. */
export enum McpTransportType {
  STDIO = 'stdio',
  HTTP = 'http',
  /** Server-Sent Events (legacy, deprecated upstream). */
  SSE = 'sse',
  WS = 'ws',
  /** claude.ai managed connector (OAuth via claude.ai org URL, no Clear auth). */
  CLAUDEAI_PROXY = 'claudeai-proxy',
}

export interface McpServerConfig {
  /**
   * Transport kind, absent when the config does not spell it out.
   *
   * `.mcp.json` treats `type` as optional: an entry with a `command` is a stdio
   * server, which is how the docs' own examples are written and how the CLI reads
   * them (`case void 0: case "stdio":` in its transport switch). Declaring this
   * required did not make it present — it only hid the case from the type checker,
   * which is how a missing `type` came to yield no transport and an empty tool
   * list with no error (#364).
   */
  type?: McpTransportType;
  /** stdio: the executable command. */
  command?: string;
  /** stdio: positional arguments to the command. */
  args?: string[];
  /** stdio: environment variable overrides passed to the server process. */
  env?: Record<string, string>;
  /** http / sse / ws: server endpoint URL. */
  url?: string;
  /** http: extra request headers. */
  headers?: Record<string, string>;
  /** claudeai-proxy: internal connector identifier. */
  id?: string;
  /** claudeai-proxy: human-readable connector display name. */
  displayName?: string;
  /** claudeai-proxy: connector icon URL. */
  iconUrl?: string;
}

export interface McpServerTool {
  name: string;
  annotations?: {
    /** Tool only reads data — no side effects. */
    readOnly?: boolean;
    /** Tool can perform irreversible destructive operations. */
    destructive?: boolean;
  };
}

export interface McpServer {
  name: string;
  status: McpServerStatus;
  /** Grouping key for the list UI. Cast to McpServerScope when known; raw string otherwise. */
  scope: McpServerScope | string;
  /**
   * Null when the CLI does not report transport details for this server
   * (e.g. claude.ai connectors, or servers added without an explicit type).
   * WebView: filter out "Add transport" prompts for null-config servers.
   */
  config: McpServerConfig | null;
  /** Available tools reported by the server. Empty array when not yet fetched. */
  tools: McpServerTool[];
  /** Human-readable error message, populated when status === FAILED or NEEDS_AUTH. */
  error: string | null;
  /**
   * Names of `${VAR}` placeholders in this server's config that no layer defines.
   *
   * Undefined means the check has not run; an empty array means it ran and found
   * nothing. Unresolved placeholders are left in the config verbatim rather than
   * blanked, so without this list the server starts with the literal `${VAR}`
   * text as a setting and fails in whatever way that value happens to cause —
   * silently, in the case that prompted #364.
   */
  missingVars?: string[];
}

/** Payload of GET_MCP_SERVERS ACK response. */
export interface McpServersResult {
  servers: McpServer[];
  /**
   * Display path of the global config file that backs the user/local scopes —
   * `~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json` when that env var is set.
   * Used to label scope groups with their real source path.
   */
  configPath?: string;
}

/**
 * A single MCP server entry from the official MCP Registry, normalised into a
 * config ready for the Add form (`claude mcp add-json` shape).
 *
 * Source: https://registry.modelcontextprotocol.io/v0/servers (Generic MCP
 * Registry API). The raw entry's packages[]/remotes[] are converted server-side
 * into a single `config`; env vars / headers that need a user-supplied value are
 * listed in `requiredInputs` so the UI can flag them.
 */
export interface McpRegistryServer {
  /** Reverse-DNS identifier, e.g. "io.github.owner/server-name". */
  name: string;
  /** Short human-readable summary (may be empty). */
  description: string;
  /** Latest version string reported by the registry. */
  version: string;
  /** Source repository URL, or null when not reported. */
  repositoryUrl: string | null;
  /** Pre-built config for the Add form. Null when the entry has no installable package/remote. */
  config: McpServerConfig | null;
  /** Names of env vars / headers the user must fill in before the server will connect. */
  requiredInputs: string[];
}

/** Payload of SEARCH_MCP_REGISTRY ACK response. */
export interface McpRegistrySearchResult {
  servers: McpRegistryServer[];
  /** Opaque cursor for the next page, or null when there are no more results. */
  nextCursor: string | null;
}

/**
 * xme rule (from Cursor source analysis): only sse/http/claudeai-proxy servers
 * expose authentication buttons. stdio servers have no auth flow.
 */
export function canAuthenticate(server: McpServer): boolean {
  if (!server.config) return false;
  return (
    server.config.type === McpTransportType.SSE ||
    server.config.type === McpTransportType.HTTP ||
    server.config.type === McpTransportType.CLAUDEAI_PROXY
  );
}
