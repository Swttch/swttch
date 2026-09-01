import type { ConnectionManager } from '../../ws/connection-manager';
import { Claude } from '../claude';
import { fetchMcpStatus, toMcpServers } from './mcp-status';
import { parseMcpList, parseMcpGet } from './mcp-parser';
import { expandMcpServerConfig } from './mcp-env-expansion';
import { buildMcpEnvSource } from './env-sources';
import {
  claudeJsonDisplayPath,
  extractProjectEntry,
  extractServerConfig,
  readClaudeJson,
  readProjectMcpJson,
  updateClaudeJson,
} from './mcp-config-files';
import { McpServerStatus, McpServerScope } from '../../shared';
import type { McpServer, McpServersResult, McpServerConfig } from '../../shared';

// Re-exported so the panel handlers and tests keep one import site for "MCP
// server management", even though the file reading itself now lives in a leaf
// module the CLI spawn path can also use.
export { claudeJsonDisplayPath, extractProjectEntry, extractServerConfig };

// ─── Scope ordering for stable list rendering ──────────────────────────────────

const SCOPE_ORDER: string[] = ['project', 'local', 'user', 'claudeai', 'managed', 'enterprise'];

function scopeRank(scope: McpServerScope | string): number {
  const i = SCOPE_ORDER.indexOf(scope as string);
  return i === -1 ? 99 : i;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all MCP servers with status, scope, config, and disabled state.
 *
 * Two sources, in order:
 *
 *   1. `mcp_status` asked of a CLI that is already running for this workspace.
 *      Preferred because it reports the state of the process the user's chat is
 *      actually talking to, carries status + scope + tools in one reply, and
 *      starts nothing (see mcp-status.ts, and #363 for what the starting cost
 *      was).
 *   2. `claude mcp list` + `claude mcp get <name>`. The official commands, and
 *      the guaranteed route: they need no live CLI, so this is what answers
 *      before a chat has sent its first message, and what answers if the control
 *      channel ever stops recognising `mcp_status`.
 *
 * Everything after the source is shared: config is re-read from the settings
 * files, failures get a probe reason, `disabledMcpServers` is applied, `${VAR}`
 * gaps are reported, and the list is sorted by scope then name.
 */
export async function getMcpServers(
  cwd?: string,
  connections?: ConnectionManager,
): Promise<McpServersResult> {
  const disabled = await readDisabledServers();
  const live = connections ? await fetchMcpStatus(connections, cwd) : null;

  // Only the CLI path can build an entry for a disabled server the source did not
  // report, and only by spawning another CLI. On the live path that spawn is
  // exactly what this change exists to avoid, so the entry is synthesised from
  // the name alone instead.
  const fetchDetails = live
    ? async (): Promise<McpServer | null> => null
    : (name: string): Promise<McpServer | null> => fetchServerDetails(name, cwd);

  let servers: McpServer[] = live ? toMcpServers(live) : await listServersViaCli(cwd);

  if (servers.length === 0 && disabled.length === 0) {
    return { servers: [], configPath: claudeJsonDisplayPath() };
  }

  // `claude mcp get` is an unreliable source for config: it omits transport
  // details for non-connected servers, and even when present it drops headers/
  // env (and its text format is brittle). For user/project servers the settings
  // file IS the source of truth, so overwrite with the file's verbatim config
  // (full env/headers preserved) — this is what makes Failed/Pending servers
  // show their config and become editable.
  const userData = await readClaudeJson();
  const projectData = cwd ? await readProjectMcpJson(cwd) : null;
  // local scope lives under projects[cwd] in ~/.claude.json (same mcpServers shape).
  const localData = cwd ? extractProjectEntry(userData, cwd) : null;
  for (const s of servers) {
    const fromFile =
      s.scope === McpServerScope.USER
        ? extractServerConfig(userData, s.name)
        : s.scope === McpServerScope.PROJECT
          ? extractServerConfig(projectData, s.name)
          : s.scope === McpServerScope.LOCAL
            ? extractServerConfig(localData, s.name)
            : null;
    if (fromFile) s.config = fromFile;
  }

  // Replace a bare failure with the reason for URL-backed servers (connection
  // refused, HTTP 4xx/5xx, unknown host). Applied to the whole list here rather
  // than inside either source, so a server reports the same way no matter which
  // source produced it. It runs after the config overwrite because the URL it
  // probes is the one the settings file holds.
  servers = await Promise.all(servers.map(enrichWithProbeError));

  // Apply disabled state. Neither source honours `disabledMcpServers` on its own
  // — both still report those servers with a live status (usually FAILED, since a
  // disabled server isn't running), so a disabled server would otherwise render
  // as "Failed" and offer no way back. Config-only ones are added here too.
  await mergeDisabledServers(servers, disabled, fetchDetails);

  // Report `${VAR}` placeholders nothing defines, the same way the CLI does in
  // its `claude mcp list` diagnostics. This runs on the list rather than when a
  // server's tools are fetched because a server broken by a missing variable
  // often does not connect at all, and the tool fetch only happens for connected
  // servers — exactly the case where the user most needs to be told why (#364).
  // One env map is built for the whole list; it does not vary per server.
  const envSource = await buildMcpEnvSource(cwd);
  for (const s of servers) {
    s.missingVars = s.config ? expandMcpServerConfig(s.config, envSource).missingVars : [];
  }

  servers.sort((a, b) => {
    const scopeDiff = scopeRank(a.scope) - scopeRank(b.scope);
    if (scopeDiff !== 0) return scopeDiff;
    return a.name.localeCompare(b.name);
  });

  return { servers, configPath: claudeJsonDisplayPath() };
}

/**
 * Override the status of servers in the `disabledMcpServers` list to DISABLED.
 *
 * Neither source honours `disabledMcpServers`: both still report those servers
 * with their live status (usually FAILED, since a disabled server isn't running),
 * so a disabled server would otherwise render as "Failed" and offer no way back.
 * For servers the source didn't report at all (config-only), `fetchDetails`
 * supplies an entry when it can. Mutates and returns `servers`.
 */
export async function mergeDisabledServers(
  servers: McpServer[],
  disabled: string[],
  fetchDetails: (name: string) => Promise<McpServer | null>,
): Promise<McpServer[]> {
  for (const disabledName of disabled) {
    const existing = servers.find((s) => s.name === disabledName);
    if (existing) {
      existing.status = McpServerStatus.DISABLED;
      existing.error = null;
    } else {
      const details = await fetchDetails(disabledName).catch(() => null);
      servers.push({
        // `tools` is deliberately absent rather than empty: nothing asked this
        // server what it exposes, and empty would claim it was asked.
        ...(details ?? {
          name: disabledName,
          scope: McpServerScope.USER,
          config: null,
        }),
        status: McpServerStatus.DISABLED,
        error: null,
      });
    }
  }
  return servers;
}

/**
 * Re-fetch a single server's details (used as a "reconnect" health-check).
 * `claude mcp get` tries to connect when invoked, so re-running it is the
 * CLI-equivalent of a reconnect probe.
 */
export async function reconnectMcpServer(name: string, cwd?: string): Promise<McpServer | null> {
  const server = await fetchServerDetails(name, cwd);
  return server ? enrichWithProbeError(server) : null;
}

/**
 * Toggle the enabled/disabled state of a named MCP server.
 * Edits the `disabledMcpServers` array in ~/.claude.json.
 * (No CLI command exists for this — CLI users also edit the file directly.)
 */
export async function setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
  // ~/.claude.json holds far more than this one array — every project the user
  // has opened, their history and their MCP config — and it is theirs, not ours.
  // So the update is atomic and it refuses to write over a file it could not
  // read, rather than replacing it with a one-key file (issue #386).
  const result = await updateClaudeJson((data) => {
    const current: string[] = Array.isArray(data.disabledMcpServers)
      ? (data.disabledMcpServers as string[])
      : [];

    data.disabledMcpServers = enabled
      ? current.filter((n) => n !== name)
      : current.includes(name) ? current : [...current, name];
    return data;
  });

  if (result.status === 'error') {
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} MCP server "${name}": ${result.error}`);
  }
}

/**
 * Add a new MCP server via `claude mcp add-json`.
 * @param scope  One of: user | project | local
 * @param cwd    Working directory to run the CLI in. CRITICAL for `project`/`local`
 *               scope: those write `.mcp.json` / project config relative to cwd, so
 *               this MUST be the user's workspace root — not the backend's own dir.
 */
export async function addMcpServer(
  name: string,
  config: Record<string, unknown>,
  scope: string,
  cwd?: string,
): Promise<void> {
  const json = JSON.stringify(config);
  const scopeFlag = scopeCliFlag(scope);
  const args = ['mcp', 'add-json', name, json];
  if (scopeFlag) args.push('-s', scopeFlag);
  // shell:false is REQUIRED here: this is the only Claude.exec caller that passes
  // arbitrary JSON as a positional arg. On win32 the default shell:true path would
  // let cmd.exe tokenize the JSON's quotes/`&`/`%`/`|`/spaces, corrupting the config
  // and exposing a command-injection surface. shell:false makes exec() spawn cmd.exe
  // with the launcher as an argv element so `&|<>` stay literal inside Node's
  // standard quoting (see Claude.exec). NOTE: a `%` in the JSON cannot be made safe
  // this way — cmd.exe expands it even inside quotes — so exec() throws on `%`
  // rather than write a corrupted config; surface that error to the user.
  const { stdout, stderr } = await Claude.exec(args, { timeout: 15000, cwd, shell: false });
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (combined.includes('error') && !combined.includes('already exists')) {
    throw new Error(`claude mcp add-json failed: ${stderr || stdout}`);
  }
}

/**
 * Remove a named MCP server via `claude mcp remove`.
 * @param cwd  Workspace root (see addMcpServer) — needed to target the right
 *             `.mcp.json` when removing a `project`/`local` scope server.
 */
export async function removeMcpServer(name: string, scope: string, cwd?: string): Promise<void> {
  const scopeFlag = scopeCliFlag(scope);
  const args = ['mcp', 'remove', name];
  if (scopeFlag) args.push('-s', scopeFlag);
  const { stderr } = await Claude.exec(args, { timeout: 10000, cwd });
  if (stderr.toLowerCase().includes('error')) {
    throw new Error(`claude mcp remove failed: ${stderr}`);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * The official-command source: `claude mcp list` for the names, then
 * `claude mcp get <name>` for each one's scope and transport details.
 *
 * Two commands rather than one because `mcp list` reports no scope and the panel
 * groups by it. Both health-check every server they know about, and each spawns
 * a CLI to do it, which is why this is the fallback rather than the first choice
 * (#363). Returns an empty list when the CLI reports nothing, without spawning
 * the per-server commands.
 */
async function listServersViaCli(cwd?: string): Promise<McpServer[]> {
  const names = parseMcpList(await runMcpList(cwd)).map((s) => s.name);
  if (names.length === 0) return [];
  const settled = await Promise.allSettled(names.map((name) => fetchServerDetails(name, cwd)));
  return settled.flatMap((r) => (r.status === 'fulfilled' && r.value !== null ? [r.value] : []));
}

async function runMcpList(cwd?: string): Promise<string> {
  try {
    const { stdout } = await Claude.exec(['mcp', 'list'], { timeout: 20000, cwd });
    return stdout;
  } catch {
    return '';
  }
}

async function fetchServerDetails(name: string, cwd?: string): Promise<McpServer | null> {
  try {
    const { stdout } = await Claude.exec(['mcp', 'get', name], { timeout: 12000, cwd });
    return parseMcpGet(stdout);
  } catch {
    return null;
  }
}

/**
 * For SSE/HTTP servers in a failed/auth-required state, probe the URL directly
 * to surface a richer error message (e.g. ECONNREFUSED, HTTP 4xx/5xx).
 * CLI only reports "Failed to connect"; this gives us the actual cause.
 */
async function enrichWithProbeError(server: McpServer): Promise<McpServer> {
  if (
    (server.status === McpServerStatus.FAILED || server.status === McpServerStatus.NEEDS_AUTH) &&
    server.config &&
    'url' in server.config &&
    typeof server.config.url === 'string'
  ) {
    const probeError = await probeUrl(server.config.url);
    if (probeError) return { ...server, error: probeError };
  }
  return server;
}

async function probeUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/event-stream, application/json, */*' },
    });
    clearTimeout(timer);
    if (!res.ok) return `HTTP ${res.status} ${res.statusText}`;
    return null;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (!(err instanceof Error)) return 'Connection failed';
    if (err.name === 'AbortError') return `Connection timed out. Is the server running at ${url}?`;

    // Node.js fetch wraps low-level errors in a TypeError with a `cause`.
    // cause can be AggregateError (ECONNREFUSED) where message is empty — check code too.
    const cause = (err as { cause?: { message?: string; code?: string } }).cause;
    const causeCode = cause?.code ?? '';
    const detail = (cause?.message || '').trim() || err.message;

    if (causeCode === 'ECONNREFUSED' || detail.includes('ECONNREFUSED')) {
      return `Unable to connect: connection refused. Is the server running at ${url}?`;
    }
    if (causeCode === 'ENOTFOUND' || detail.includes('ENOTFOUND') || detail.includes('getaddrinfo')) {
      return `Unable to connect: hostname not found. Is the URL correct? (${url})`;
    }
    return detail || 'Connection failed';
  }
}

async function readDisabledServers(): Promise<string[]> {
  const data = await readClaudeJson();
  return Array.isArray(data.disabledMcpServers) ? (data.disabledMcpServers as string[]) : [];
}

/** Map our scope string to the -s flag value the CLI accepts. */
function scopeCliFlag(scope: string): string | null {
  switch (scope) {
    case 'user': return 'user';
    case 'project': return 'project';
    case 'local': return 'local';
    default: return null;
  }
}
