/**
 * Official MCP Registry client + normaliser.
 *
 * Source of truth: the community-driven Generic MCP Registry API, hosted at
 *   https://registry.modelcontextprotocol.io/v0/servers
 * (backed by Anthropic/GitHub/Microsoft/PulseMCP). We talk to its PUBLIC REST
 * contract only — no Claude SDK, no undocumented protocol — so this honours the
 * project's CLI-equivalence / no-official-dependency principle. The endpoint is
 * isolated here so a future swap to another spec-compatible sub-registry
 * (PulseMCP etc.) is a one-line change.
 *
 * Each raw entry carries install metadata in `packages[]` (stdio) and
 * `remotes[]` (http/sse). We convert one entry into a single `config` ready for
 * `claude mcp add-json`, and surface env vars / headers that still need a
 * user-supplied value via `requiredInputs`.
 */

import { McpTransportType } from '../../shared';
import { proxiedRequest } from './outbound-proxy';
import type { McpServerConfig, McpRegistryServer, McpRegistrySearchResult } from '../../shared';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const PAGE_LIMIT = 30;
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Raw registry shapes (the public API's response contract) ──────────────────

interface RawArgument {
  type?: string;
  name?: string;
  value?: string | number;
}
interface RawEnvVar {
  name?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
}
interface RawHeader {
  name?: string;
  value?: string;
  isRequired?: boolean;
}
interface RawPackage {
  registryType?: string;
  identifier?: string;
  runtimeHint?: string;
  transport?: { type?: string };
  runtimeArguments?: RawArgument[];
  packageArguments?: RawArgument[];
  environmentVariables?: RawEnvVar[];
}
interface RawRemote {
  type?: string;
  url?: string;
  headers?: RawHeader[];
}
interface RawServer {
  name?: string;
  description?: string;
  version?: string;
  repository?: { url?: string };
  packages?: RawPackage[];
  remotes?: RawRemote[];
}
interface RawEntry {
  server?: RawServer;
}
interface RawSearchResponse {
  servers?: unknown[];
  metadata?: { nextCursor?: string };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search the official registry by name substring. `query` empty returns the
 * first page unfiltered. Throws on network error / non-2xx so the handler can
 * report it.
 */
export async function searchMcpRegistry(
  query: string,
  cursor?: string,
): Promise<McpRegistrySearchResult> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());
  params.set('limit', String(PAGE_LIMIT));
  if (cursor) params.set('cursor', cursor);

  // proxiedRequest, not fetch: the global fetch ignores HTTP_PROXY, so behind a corporate
  // proxy the server browser came up empty with no explanation. The deadline moves into the
  // request with it — an AbortController does nothing for a node:https request.
  const res = await proxiedRequest(`${REGISTRY_BASE}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`MCP registry returned HTTP ${res.status}`);
  }
  const data = JSON.parse(res.body) as RawSearchResponse;
  const servers: McpRegistryServer[] = (data.servers ?? [])
    .map(normalizeRegistryServer)
    .filter((s): s is McpRegistryServer => s !== null);
  return { servers, nextCursor: data.metadata?.nextCursor ?? null };
}

/**
 * Convert one raw registry entry into a normalised, install-ready summary.
 * Returns null when the entry has no usable `server` object. A stdio package is
 * preferred over a remote when both are present (local execution is the default
 * CLI users expect from `claude mcp add`).
 */
export function normalizeRegistryServer(entry: unknown): McpRegistryServer | null {
  if (!entry || typeof entry !== 'object') return null;
  const server = (entry as RawEntry).server;
  if (!server || typeof server !== 'object') return null;

  const requiredInputs: string[] = [];
  const config = buildConfig(server, requiredInputs);

  return {
    name: typeof server.name === 'string' ? server.name : '',
    description: typeof server.description === 'string' ? server.description : '',
    version: typeof server.version === 'string' ? server.version : '',
    repositoryUrl:
      server.repository && typeof server.repository.url === 'string'
        ? server.repository.url
        : null,
    config,
    requiredInputs,
  };
}

// ─── Internal: raw entry → McpServerConfig ─────────────────────────────────────

function buildConfig(server: RawServer, requiredInputs: string[]): McpServerConfig | null {
  const pkg = server.packages?.[0];
  if (pkg) return buildStdioConfig(pkg, requiredInputs);

  const remote = server.remotes?.[0];
  if (remote) return buildRemoteConfig(remote, requiredInputs);

  return null;
}

function buildStdioConfig(pkg: RawPackage, requiredInputs: string[]): McpServerConfig {
  const command = pkg.runtimeHint?.trim() || defaultRuntime(pkg.registryType);

  const args: string[] = [];
  for (const arg of pkg.runtimeArguments ?? []) pushArg(args, arg);
  if (pkg.identifier) args.push(pkg.identifier);
  for (const arg of pkg.packageArguments ?? []) pushArg(args, arg);

  const env: Record<string, string> = {};
  for (const ev of pkg.environmentVariables ?? []) {
    if (ev.isRequired && ev.name) {
      env[ev.name] = ev.default ?? '';
      requiredInputs.push(ev.name);
    }
  }

  const config: McpServerConfig = { type: McpTransportType.STDIO, command, args };
  if (Object.keys(env).length > 0) config.env = env;
  return config;
}

function buildRemoteConfig(remote: RawRemote, requiredInputs: string[]): McpServerConfig {
  const type = remote.type === 'sse' ? McpTransportType.SSE : McpTransportType.HTTP;

  const headers: Record<string, string> = {};
  for (const h of remote.headers ?? []) {
    if (h.isRequired && h.name) {
      headers[h.name] = h.value ?? '';
      requiredInputs.push(h.name);
    }
  }

  const config: McpServerConfig = { type, url: remote.url ?? '' };
  if (Object.keys(headers).length > 0) config.headers = headers;
  return config;
}

/** Append one CLI argument: named → `--flag value`, positional → `value`. */
function pushArg(args: string[], arg: RawArgument): void {
  if (arg.type === 'named' && arg.name) {
    args.push(arg.name);
    if (arg.value !== undefined && arg.value !== null) args.push(String(arg.value));
    return;
  }
  if (arg.value !== undefined && arg.value !== null) args.push(String(arg.value));
}

/** npm → npx, pypi → uvx; default to npx for unknown registry types. */
function defaultRuntime(registryType?: string): string {
  if (registryType === 'pypi') return 'uvx';
  return 'npx';
}
