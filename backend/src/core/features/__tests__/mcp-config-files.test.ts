import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { collectMcpServerConfigs } from '../mcp-config-files';

/**
 * Reads real files under a temp `CLAUDE_CONFIG_DIR` rather than mocking `fs`,
 * because what is being pinned down here is which files get read and how their
 * contents are combined.
 */
describe('collectMcpServerConfigs', () => {
  let configDir: string;
  let workspace: string;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

  const writeClaudeJson = (data: unknown): void =>
    writeFileSync(join(configDir, '.claude.json'), JSON.stringify(data));

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-cfg-'));
    workspace = mkdtempSync(join(tmpdir(), 'ccg-ws-'));
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    rmSync(configDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns user-scope servers', async () => {
    writeClaudeJson({ mcpServers: { a: { command: 'npx', args: ['a'] } } });
    expect(await collectMcpServerConfigs(workspace)).toEqual([{ command: 'npx', args: ['a'] }]);
  });

  it('returns the workspace .mcp.json servers', async () => {
    writeClaudeJson({});
    writeFileSync(
      join(workspace, '.mcp.json'),
      JSON.stringify({ mcpServers: { p: { command: 'docker', args: ['run', 'img'] } } }),
    );
    expect(await collectMcpServerConfigs(workspace)).toEqual([
      { command: 'docker', args: ['run', 'img'] },
    ]);
  });

  it('returns project-entry servers filed under a path that is not the given cwd', async () => {
    // The regression this exists for. The CLI files a git worktree's local-scope
    // servers under the MAIN checkout's path, so looking up `projects[cwd]` finds
    // nothing while a CLI started in that worktree happily starts those servers.
    // Measured: the container reclaim silently did nothing for a whole worktree.
    writeClaudeJson({
      projects: {
        '/some/other/checkout': { mcpServers: { d: { command: 'docker', args: ['run', 'img'] } } },
      },
    });
    expect(await collectMcpServerConfigs('/a/completely/unrelated/worktree')).toEqual([
      { command: 'docker', args: ['run', 'img'] },
    ]);
  });

  it('combines every source rather than letting one scope win', async () => {
    writeClaudeJson({
      mcpServers: { u: { command: 'user-cmd' } },
      projects: { '/elsewhere': { mcpServers: { l: { command: 'local-cmd' } } } },
    });
    writeFileSync(
      join(workspace, '.mcp.json'),
      JSON.stringify({ mcpServers: { p: { command: 'project-cmd' } } }),
    );
    const commands = (await collectMcpServerConfigs(workspace)).map((c) => c.command);
    expect(commands.sort()).toEqual(['local-cmd', 'project-cmd', 'user-cmd']);
  });

  it('returns nothing when no configuration exists, so callers stay inert', async () => {
    expect(await collectMcpServerConfigs(workspace)).toEqual([]);
  });

  it('survives a malformed .claude.json instead of throwing at the spawn path', async () => {
    writeFileSync(join(configDir, '.claude.json'), '{ not json');
    expect(await collectMcpServerConfigs(workspace)).toEqual([]);
  });

  it('ignores project entries whose mcpServers is missing or not an object', async () => {
    writeClaudeJson({ projects: { '/a': {}, '/b': { mcpServers: 'nope' } } });
    expect(await collectMcpServerConfigs(workspace)).toEqual([]);
  });

  it('works with no workspace at all', async () => {
    writeClaudeJson({ mcpServers: { a: { command: 'npx' } } });
    expect(await collectMcpServerConfigs(undefined)).toEqual([{ command: 'npx' }]);
  });

  it('does not read a .mcp.json outside the given workspace', async () => {
    writeClaudeJson({});
    const other = mkdtempSync(join(tmpdir(), 'ccg-other-'));
    mkdirSync(join(other, 'sub'), { recursive: true });
    writeFileSync(
      join(other, '.mcp.json'),
      JSON.stringify({ mcpServers: { x: { command: 'nope' } } }),
    );
    expect(await collectMcpServerConfigs(workspace)).toEqual([]);
    rmSync(other, { recursive: true, force: true });
  });
});
