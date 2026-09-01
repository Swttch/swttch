import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpEnvSource } from '../env-sources';

/**
 * These tests drive the real filesystem rather than a mock: the whole point of
 * the module is which paths it looks at, and a mocked `readFile` would assert
 * our own idea of those paths instead of the ones that get opened.
 *
 * `CLAUDE_CONFIG_DIR` stands in for the home scope so no test ever reads or
 * writes the developer's actual `~/.claude`. Under that variable the CLI (and
 * we) resolve `~/.claude.json` and `~/.claude/.claude.json` to the same file,
 * which is itself asserted below.
 */
describe('buildMcpEnvSource', () => {
  let configDir: string;
  let projectDir: string;
  let projectClaudeDir: string;
  let savedConfigDir: string | undefined;

  const writeJson = (path: string, value: unknown) =>
    writeFileSync(path, JSON.stringify(value), 'utf-8');

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-env-home-'));
    projectDir = mkdtempSync(join(tmpdir(), 'ccg-env-proj-'));
    projectClaudeDir = join(projectDir, '.claude');
    mkdirSync(projectClaudeDir, { recursive: true });
    savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
    rmSync(configDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('starts from process.env', async () => {
    const env = await buildMcpEnvSource();
    expect(env.PATH).toBe(process.env.PATH);
  });

  it('lets a user-scope settings.json override process.env', async () => {
    process.env.CCG_TEST_ONE = 'from-process';
    try {
      writeJson(join(configDir, 'settings.json'), { env: { CCG_TEST_ONE: 'from-settings' } });
      const env = await buildMcpEnvSource();
      expect(env.CCG_TEST_ONE).toBe('from-settings');
    } finally {
      delete process.env.CCG_TEST_ONE;
    }
  });

  it('orders the user scope: .claude.json < settings.json < settings.local.json', async () => {
    writeJson(join(configDir, '.claude.json'), { env: { A: 'claude-json', B: 'claude-json', C: 'claude-json' } });
    writeJson(join(configDir, 'settings.json'), { env: { B: 'settings', C: 'settings' } });
    writeJson(join(configDir, 'settings.local.json'), { env: { C: 'settings-local' } });

    const env = await buildMcpEnvSource();
    expect(env.A).toBe('claude-json');
    expect(env.B).toBe('settings');
    expect(env.C).toBe('settings-local');
  });

  it('reads the mcp.json family in the user scope too', async () => {
    writeJson(join(configDir, 'mcp.json'), { env: { FROM_MCP_JSON: 'yes' } });
    writeJson(join(configDir, '.mcp.json'), { env: { FROM_DOT_MCP_JSON: 'yes' } });
    writeJson(join(configDir, 'claude.json'), { env: { FROM_CLAUDE_JSON: 'yes' } });

    const env = await buildMcpEnvSource();
    expect(env.FROM_MCP_JSON).toBe('yes');
    expect(env.FROM_DOT_MCP_JSON).toBe('yes');
    expect(env.FROM_CLAUDE_JSON).toBe('yes');
  });

  it('lets every project-scope file outrank the user scope', async () => {
    writeJson(join(configDir, 'settings.local.json'), {
      env: { P1: 'user', P2: 'user', P3: 'user', P4: 'user', P5: 'user', P6: 'user' },
    });
    writeJson(join(projectDir, '.claude.json'), { env: { P1: 'project' } });
    writeJson(join(projectClaudeDir, '.claude.json'), { env: { P2: 'project' } });
    writeJson(join(projectClaudeDir, 'claude.json'), { env: { P3: 'project' } });
    writeJson(join(projectDir, '.mcp.json'), { env: { P4: 'project' } });
    writeJson(join(projectClaudeDir, 'mcp.json'), { env: { P5: 'project' } });
    writeJson(join(projectClaudeDir, 'settings.json'), { env: { P6: 'project' } });

    const env = await buildMcpEnvSource(projectDir);
    for (const key of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      expect(env[key], `${key} should come from the project scope`).toBe('project');
    }
  });

  it('orders the project scope: settings.json < settings.local.json', async () => {
    writeJson(join(projectClaudeDir, 'settings.json'), { env: { X: 'settings', Y: 'settings' } });
    writeJson(join(projectClaudeDir, 'settings.local.json'), { env: { Y: 'settings-local' } });

    const env = await buildMcpEnvSource(projectDir);
    expect(env.X).toBe('settings');
    expect(env.Y).toBe('settings-local');
  });

  it('reads projects[<path>].env from the global config, below the project files', async () => {
    writeJson(join(configDir, '.claude.json'), {
      env: { FROM_GLOBAL: 'global' },
      projects: { [projectDir]: { env: { FROM_ENTRY: 'entry', SHARED: 'entry' } } },
    });
    writeJson(join(projectClaudeDir, 'settings.json'), { env: { SHARED: 'project-file' } });

    const env = await buildMcpEnvSource(projectDir);
    expect(env.FROM_ENTRY).toBe('entry');
    expect(env.SHARED).toBe('project-file');
    // The entry outranks the plain global env of the same file.
    expect(env.FROM_GLOBAL).toBe('global');
  });

  it('lets projects[<path>].env outrank the user scope', async () => {
    writeJson(join(configDir, 'settings.local.json'), { env: { SCOPED: 'user' } });
    writeJson(join(configDir, '.claude.json'), {
      projects: { [projectDir]: { env: { SCOPED: 'entry' } } },
    });

    const env = await buildMcpEnvSource(projectDir);
    expect(env.SCOPED).toBe('entry');
  });

  it('ignores the project layers entirely without a projectPath', async () => {
    writeJson(join(projectClaudeDir, 'settings.json'), { env: { ONLY_IN_PROJECT: 'yes' } });
    const env = await buildMcpEnvSource();
    expect(env.ONLY_IN_PROJECT).toBeUndefined();
  });

  it('skips a missing file, malformed JSON, and a non-object env', async () => {
    writeFileSync(join(configDir, 'settings.json'), '{ not json', 'utf-8');
    writeJson(join(configDir, 'settings.local.json'), { env: 'not-an-object' });
    writeJson(join(configDir, 'mcp.json'), { env: { SURVIVES: 'yes' } });

    const env = await buildMcpEnvSource();
    expect(env.SURVIVES).toBe('yes');
  });

  it('skips non-string values rather than coercing them', async () => {
    writeJson(join(configDir, 'settings.json'), {
      env: { STR: 'kept', NUM: 1, OBJ: { a: 1 }, NUL: null, ARR: ['x'] },
    });

    const env = await buildMcpEnvSource();
    expect(env.STR).toBe('kept');
    expect(env.NUM).toBeUndefined();
    expect(env.OBJ).toBeUndefined();
    expect(env.NUL).toBeUndefined();
    expect(env.ARR).toBeUndefined();
  });

  it('merges a duplicate path only once under CLAUDE_CONFIG_DIR', async () => {
    // $CLAUDE_CONFIG_DIR/.claude.json is both "~/.claude.json" and
    // "~/.claude/.claude.json"; one file must not be applied at two ranks.
    writeJson(join(configDir, '.claude.json'), { env: { ONCE: 'claude-json' } });
    writeJson(join(configDir, 'settings.json'), { env: { ONCE: 'settings' } });

    const env = await buildMcpEnvSource();
    expect(env.ONCE).toBe('settings');
  });
});
