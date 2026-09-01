/**
 * Reading MCP server configuration out of the files that define it.
 *
 * Split out of mcp-manager so that code which only needs to know WHAT is
 * configured does not have to import the code that talks to the CLI. The
 * container reclaimer is the reason: it hangs off the CLI spawn path, and
 * pulling mcp-manager in from there would close a cycle
 * (claude-process → mcp-manager → mcp-status → claude-process).
 *
 * Kept as one module rather than duplicated readers, because "where does MCP
 * configuration live" is a single decision: `$CLAUDE_CONFIG_DIR` overriding the
 * home directory, local scope hiding under `projects[cwd]`, project scope in the
 * workspace's own `.mcp.json`. Two copies of that would drift.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { McpServerConfig } from '../../shared';

/** Path to the global claude config file that stores disabledMcpServers. */
export function claudeJsonPath(): string {
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

export async function readClaudeJson(): Promise<Record<string, unknown>> {
  try {
    const p = claudeJsonPath();
    if (!existsSync(p)) return {};
    return JSON.parse(await readFile(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  const p = claudeJsonPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Read and parse `{cwd}/.mcp.json` (project-scope server configs). Returns null
 * on absent/invalid file — config enrichment is best-effort.
 */
export async function readProjectMcpJson(cwd: string): Promise<unknown> {
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

/** Every `mcpServers` value in one map, ignoring entries that are not objects. */
function configsIn(data: unknown): McpServerConfig[] {
  if (!data || typeof data !== 'object') return [];
  const servers = (data as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== 'object') return [];
  return Object.values(servers as Record<string, unknown>).filter(
    (cfg): cfg is McpServerConfig => Boolean(cfg) && typeof cfg === 'object',
  );
}

/**
 * Every MCP server the user has configured anywhere, plus the workspace's own
 * `.mcp.json`.
 *
 * Deliberately not narrowed to the entry that matches `cwd`. The CLI decides
 * which `projects[...]` entry a directory belongs to by its own rule, and that
 * rule is not the literal path: a git worktree is filed under the main
 * checkout's path, and a subdirectory is filed under the project root. Matching
 * on the literal `cwd` therefore finds nothing in exactly the cases where a
 * caller most needs an answer, and finding nothing here is silent — measured,
 * while the container reclaim quietly did nothing for a worktree.
 *
 * Reproducing the CLI's resolution would be guesswork against an undocumented
 * rule, so this returns the superset instead. That is sound for the question
 * being asked, which is "what could a CLI have started", not "which entry wins".
 * Callers that act on the answer match a container against a configuration AND
 * against the window it appeared in, so a wider candidate set costs a few more
 * comparisons and grants no extra licence to remove anything.
 *
 * Names are not returned and duplicates are not resolved, for the same reason.
 */
export async function collectMcpServerConfigs(cwd?: string): Promise<McpServerConfig[]> {
  const userData = await readClaudeJson();
  const configs = configsIn(userData);

  const projects = userData.projects;
  if (projects && typeof projects === 'object') {
    for (const entry of Object.values(projects as Record<string, unknown>)) {
      configs.push(...configsIn(entry));
    }
  }

  if (cwd) configs.push(...configsIn(await readProjectMcpJson(cwd)));
  return configs;
}
