import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Claude } from '../claude';
import { parseMcpList, parseMcpGet } from './mcp-parser';
import { expandMcpServerConfig } from './mcp-env-expansion';
import { buildMcpEnvSource } from './env-sources';
import { McpServerStatus, McpServerScope } from '../../shared';
import type { McpServer, McpServersResult, McpServerConfig } from '../../shared';

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Path to the global claude config file that stores disabledMcpServers. */
function claudeJsonPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), '.claude.json');
}

/**
 * Display form of the global config path, shown next to the user/local scope
 * groups in the UI. Resolves to `~/.claude.json` normally, or the absolute
 * `$CLAUDE_CONFIG_DIR/.claude.json` when that env var overrides the home dir —
 * so the displayed source path always matches where `claude mcp add` writes.
 */
export function claudeJsonDisplayPath(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  return dir ? join(dir, '.claude.json') : '~/.claude.json';
}

async function readClaudeJson(): Promise<Record<string, unknown>> {
  try {
    const p = claudeJsonPath();
    if (!existsSync(p)) return {};
    return JSON.parse(await readFile(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  const p = claudeJsonPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

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
 * Strategy (CLI-first, per CLAUDE.md):
 *   1. `claude mcp list` → names + basic status (performs health check)
 *   2. `claude mcp get <name>` in parallel → full details per server
 *   3. Read disabledMcpServers from ~/.claude.json → mark DISABLED
 *
 * Servers are sorted by scope priority then name.
 */
export async function getMcpServers(cwd?: string): Promise<McpServersResult> {
  const [listOut, disabled] = await Promise.all([runMcpList(cwd), readDisabledServers()]);
  const names = parseMcpList(listOut).map((s) => s.name);

  if (names.length === 0 && disabled.length === 0) {
    return { servers: [], configPath: claudeJsonDisplayPath() };
  }

  // Fetch details for all connected/failed servers in parallel.
  const settled = await Promise.allSettled(names.map((name) => fetchServerDetails(name, cwd)));

  const servers: McpServer[] = settled.flatMap((r) => {
    if (r.status === 'fulfilled' && r.value !== null) return [r.value];
    return [];
  });

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

  // Apply disabled state. `claude mcp list` does NOT honour disabledMcpServers —
  // it still reports those servers (and health-checks them), so their status must
  // be overridden to DISABLED here, plus synthetic entries for config-only ones.
  await mergeDisabledServers(servers, disabled, (name) => fetchServerDetails(name, cwd));

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
 * `claude mcp list` ignores `disabledMcpServers` and still reports those servers
 * with their live status (usually FAILED, since a disabled server isn't running),
 * so a disabled server would otherwise render as "Failed" and offer no way back.
 * For servers the CLI didn't report at all (config-only), a synthetic entry is
 * fetched and added. Mutates and returns `servers`.
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
        ...(details ?? {
          name: disabledName,
          scope: McpServerScope.USER,
          config: null,
          tools: [],
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
  return fetchServerDetails(name, cwd);
}

/**
 * Toggle the enabled/disabled state of a named MCP server.
 * Edits the `disabledMcpServers` array in ~/.claude.json.
 * (No CLI command exists for this — CLI users also edit the file directly.)
 */
export async function setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
  const data = await readClaudeJson();
  const current: string[] = Array.isArray(data.disabledMcpServers)
    ? (data.disabledMcpServers as string[])
    : [];

  const updated = enabled
    ? current.filter((n) => n !== name)
    : current.includes(name) ? current : [...current, name];

  await writeClaudeJson({ ...data, disabledMcpServers: updated });
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
    const server = parseMcpGet(stdout);
    if (!server) return null;
    return await enrichWithProbeError(server);
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

/**
 * Read and parse `{cwd}/.mcp.json` (project-scope server configs). Returns null
 * on absent/invalid file — config enrichment is best-effort.
 */
async function readProjectMcpJson(cwd: string): Promise<unknown> {
  try {
    const p = join(cwd, '.mcp.json');
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Pull the per-project entry (`projects[cwd]`) out of `~/.claude.json`, where
 * local-scope servers live under its `mcpServers`. Returns null when absent.
 */
export function extractProjectEntry(data: unknown, cwd: string): unknown {
  if (!data || typeof data !== 'object') return null;
  const projects = (data as Record<string, unknown>).projects;
  if (!projects || typeof projects !== 'object') return null;
  return (projects as Record<string, unknown>)[cwd] ?? null;
}

/**
 * Pull one server's raw config out of an `mcpServers` map, verbatim (no key
 * renaming) per the original-data-preservation rule.
 */
export function extractServerConfig(data: unknown, name: string): McpServerConfig | null {
  if (!data || typeof data !== 'object') return null;
  const servers = (data as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== 'object') return null;
  const cfg = (servers as Record<string, unknown>)[name];
  return cfg && typeof cfg === 'object' ? (cfg as McpServerConfig) : null;
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
