/**
 * The environment an MCP server is spawned with, and the map its `${VAR}`
 * placeholders resolve against.
 *
 * The `claude` CLI expands a placeholder against its own process environment,
 * into which it has already injected the `env` blocks it reads from disk. Our
 * backend is a separate process, so none of that reaches `process.env` here:
 * without reading those files ourselves, a placeholder that resolves in the
 * terminal resolves to nothing in the panel (#364).
 *
 * We deliberately read more files than the CLI does. Measured against CLI
 * 2.1.170, the CLI expands against the user scope only — the `env` of a
 * project's `.claude/settings.json` is injected into the spawned server's
 * environment yet is NOT visible to `${VAR}` expansion in the same run, so a
 * project that keeps its secret in project scope cannot reference it from
 * `.mcp.json`. That split is treated here as a CLI defect rather than a
 * contract to mirror, because the report in #364 puts its value in exactly the
 * place the CLI skips. The same reasoning covers the files below that the CLI
 * ignores entirely: reading a value a user wrote is harmless, silently
 * ignoring it is not.
 *
 * One map serves both purposes. Expansion source and spawned-server
 * environment are the same object, so the two can never disagree about what
 * `FOO` means.
 */

import { homedir, } from 'os';
import { realpathSync } from 'fs';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import { readJsonFileSafe } from './claude-settings';

/**
 * Where `~/.claude.json` lives. `CLAUDE_CONFIG_DIR` relocates the whole config
 * area, so the file sits directly inside it rather than beside a home dir that
 * is no longer in play — the same resolution `mcp-manager` uses for the config
 * it writes, so both agree on which file is "the" global config.
 */
function userClaudeJsonPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), '.claude.json');
}

/**
 * User-scope files that may carry an `env` block, lowest precedence first.
 *
 * `settings.json` and `settings.local.json` come last because they are the
 * files a user edits to set settings on purpose; the `.claude.json` /
 * `.mcp.json` family is written by tooling, and an `env` placed there is read
 * only so that it is not silently dropped.
 *
 * With `CLAUDE_CONFIG_DIR` set, the first two entries resolve to the same file;
 * duplicates are removed so a value is not merged twice under one precedence.
 */
function userScopeEnvFiles(): string[] {
  const configDir = getClaudeConfigDir();
  const jsonBase = process.env.CLAUDE_CONFIG_DIR ?? homedir();
  return dedupe([
    join(jsonBase, '.claude.json'),
    join(configDir, '.claude.json'),
    join(configDir, 'claude.json'),
    join(jsonBase, '.mcp.json'),
    join(configDir, '.mcp.json'),
    join(configDir, 'mcp.json'),
    join(configDir, 'settings.json'),
    join(configDir, 'settings.local.json'),
  ]);
}

/**
 * Project-scope files, mirroring the user-scope list one-for-one so that a
 * value can be placed in the same shape of file at either level.
 */
function projectScopeEnvFiles(projectPath: string): string[] {
  const claudeDir = join(projectPath, '.claude');
  return dedupe([
    join(projectPath, '.claude.json'),
    join(claudeDir, '.claude.json'),
    join(claudeDir, 'claude.json'),
    join(projectPath, '.mcp.json'),
    join(claudeDir, '.mcp.json'),
    join(claudeDir, 'mcp.json'),
    join(claudeDir, 'settings.json'),
    join(claudeDir, 'settings.local.json'),
  ]);
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

/**
 * Pull the `env` block out of a parsed config file.
 *
 * Only string values are taken. A number or object under `env` cannot be handed
 * to a child process as-is, and coercing it would invent a value the user never
 * wrote, so it is skipped rather than stringified.
 */
function readEnvBlock(json: Record<string, unknown>): Record<string, string> {
  const env = json.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * The `env` of `projects[<projectPath>]` inside `~/.claude.json`.
 *
 * This entry is a home-dir file holding project-specific state — it is where
 * `claude mcp add --scope local` puts a server — so it belongs to the project
 * group despite its location, and sits below the project's own files because a
 * file the user edits by hand outranks one tooling maintains.
 *
 * The CLI keys this map by the resolved path, so a project reached through a
 * symlink (`/tmp` → `/private/tmp` on macOS) is stored under a name that does
 * not match the path we were handed. Both spellings are tried.
 */
function readProjectEntryEnv(
  claudeJson: Record<string, unknown>,
  projectPath: string,
): Record<string, string> {
  const projects = claudeJson.projects;
  if (projects === null || typeof projects !== 'object' || Array.isArray(projects)) return {};
  const byPath = projects as Record<string, unknown>;
  for (const key of dedupe([projectPath, resolveRealPath(projectPath)])) {
    const entry = byPath[key];
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      return readEnvBlock(entry as Record<string, unknown>);
    }
  }
  return {};
}

/** The path with symlinks resolved, or the path itself when it cannot be resolved. */
function resolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Build the environment for an MCP server, merging every layer that may define
 * one, lowest precedence first.
 *
 * Ordering, from weakest to strongest:
 *   1. `process.env`
 *   2. the user-scope files, in `userScopeEnvFiles()` order
 *   3. `projects[<projectPath>].env` in the global `.claude.json`
 *   4. the project-scope files, in `projectScopeEnvFiles()` order
 *
 * Without a `projectPath` only the first two apply, which is the correct answer
 * for a server that has no project to be read from rather than a degraded one.
 *
 * Files are read concurrently and merged in list order, so a missing file costs
 * one `existsSync` and never changes the outcome.
 */
export async function buildMcpEnvSource(
  projectPath?: string,
): Promise<Record<string, string | undefined>> {
  const merged: Record<string, string | undefined> = { ...process.env };

  const userFiles = userScopeEnvFiles();
  const userBlocks = await Promise.all(userFiles.map((file) => readEnvOf(file)));
  for (const block of userBlocks) Object.assign(merged, block);

  if (projectPath) {
    const globalConfig = await readJsonFileSafe(userClaudeJsonPath());
    Object.assign(merged, readProjectEntryEnv(globalConfig, projectPath));

    const projectFiles = projectScopeEnvFiles(projectPath);
    const projectBlocks = await Promise.all(projectFiles.map((file) => readEnvOf(file)));
    for (const block of projectBlocks) Object.assign(merged, block);
  }

  return merged;
}

async function readEnvOf(file: string): Promise<Record<string, string>> {
  return readEnvBlock(await readJsonFileSafe(file));
}
