import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildSessionMcpArgs } from '../claude-process';

/**
 * The config reaches the CLI as a file path, never as inline JSON.
 *
 * On win32 the chat CLI is started through cmd.exe, which takes the command line as one string
 * and strips the JSON's double quotes (`{mcpServers:{...}}`), and quoting the JSON does not help
 * because cmd.exe has no backslash escaping. The CLI then reads that as a relative path and
 * exits with `MCP config file not found` — every message failed (#755). A path carries no quotes
 * for cmd.exe to strip, so it is the one form that survives every platform's spawn path.
 */

// An isolated CCG_HOME per suite: the config file is written for real, and a test must never
// touch the user's own data folder.
let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'session-mcp-args-'));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  SWTTCH_SESSION_MCP_BIN: '/opt/swttch/session-mcp/src/cli.js',
  CCG_HOME: home,
  ...extra,
});

describe('buildSessionMcpArgs', () => {
  it('adds nothing when no host named the server', () => {
    expect(buildSessionMcpArgs({ CCG_HOME: home }, 'sess-1')).toEqual([]);
  });

  it('adds nothing when the host variable is empty', () => {
    expect(buildSessionMcpArgs({ SWTTCH_SESSION_MCP_BIN: '', CCG_HOME: home }, 'sess-1')).toEqual([]);
  });

  it('hands the CLI a file path, never inline JSON', () => {
    const args = buildSessionMcpArgs(env(), 'sess-1');
    expect(args[0]).toBe('--mcp-config');
    expect(args).toHaveLength(2);
    // The defect: JSON on the command line is what cmd.exe tears apart.
    expect(args[1]).not.toContain('{');
    expect(args[1]).not.toContain('"');
    expect(args[1].endsWith('.json')).toBe(true);
  });

  it('writes that path with one server per area, each told which session is calling', () => {
    const [, file] = buildSessionMcpArgs(env(), 'sess-1');
    expect(existsSync(file)).toBe(true);
    const config = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(config.mcpServers)).toEqual([
      'swttch_session_mgmt', 'swttch_session', 'swttch_sidebar', 'swttch_window', 'swttch_view', 'swttch_host',
      'swttch_pr', 'swttch_settings', 'swttch_directory', 'swttch_connectors', 'swttch_turn',
    ]);
    const server = config.mcpServers.swttch_session_mgmt;
    expect(server.command).toBe('node');
    expect(server.args).toEqual(['/opt/swttch/session-mcp/src/cli.js', '--area', 'session_mgmt']);
    expect(server.env.SWTTCH_SESSION_ID).toBe('sess-1');
  });

  it('keeps each session in its own file, so two CLIs starting at once cannot overwrite each other', () => {
    const [, first] = buildSessionMcpArgs(env(), 'sess-a');
    const [, second] = buildSessionMcpArgs(env(), 'sess-b');
    expect(first).not.toBe(second);
    const idOf = (file: string) => JSON.parse(readFileSync(file, 'utf8')).mcpServers.swttch_session.env.SWTTCH_SESSION_ID;
    expect(idOf(first)).toBe('sess-a');
    expect(idOf(second)).toBe('sess-b');
  });

  it('rewrites the file on the next spawn, so a setting change needs no backend restart', () => {
    const [, file] = buildSessionMcpArgs(env(), 'sess-rewrite');
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers)).toHaveLength(11);
    const [, again] = buildSessionMcpArgs(env({ SWTTCH_SESSION_MCP_AREAS: 'sidebar' }), 'sess-rewrite');
    expect(again).toBe(file);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers)).toEqual(['swttch_sidebar']);
  });

  it('uses the node the host names, and hands the data and config folders on', () => {
    const [, file] = buildSessionMcpArgs(env({
      SWTTCH_SESSION_MCP_NODE: '/usr/local/bin/node',
      CLAUDE_CONFIG_DIR: '/home/u/.claude-alt',
      ELECTRON_RUN_AS_NODE: '1',
    }), 'sess-2');
    const server = JSON.parse(readFileSync(file, 'utf8')).mcpServers.swttch_sidebar;
    expect(server.command).toBe('/usr/local/bin/node');
    expect(server.env).toEqual({
      SWTTCH_SESSION_ID: 'sess-2',
      CCG_HOME: home,
      CLAUDE_CONFIG_DIR: '/home/u/.claude-alt',
      ELECTRON_RUN_AS_NODE: '1',
    });
  });

  it('serves only the areas the host lists', () => {
    const [, file] = buildSessionMcpArgs(env({ SWTTCH_SESSION_MCP_AREAS: 'sidebar, session_mgmt' }), 'sess-3');
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers)).toEqual(['swttch_sidebar', 'swttch_session_mgmt']);
  });

  it('leaves out an area name that is not a plain identifier, so nothing odd reaches the command line', () => {
    const [, file] = buildSessionMcpArgs(env({ SWTTCH_SESSION_MCP_AREAS: 'sidebar,../evil, a b' }), 'sess-4');
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers)).toEqual(['swttch_sidebar']);
  });

  // CCG_HOME is the documented way to move the data folder, and the config file is user data like
  // everything else this backend keeps. A host that sets it must find the file there, not in the
  // default folder.
  it('follows CCG_HOME', () => {
    const [, file] = buildSessionMcpArgs(env(), 'sess-home');
    expect(file.startsWith(home)).toBe(true);
    expect(file).toContain('mcp');
  });

  describe('an installed @swttch/session-manager-mcp', () => {
    const installed = { entry: '/g/node_modules/@swttch/session-manager-mcp/src/cli.js', areas: ['session_mgmt', 'pr'] };

    it('runs the installed entry under this backend\'s Node, one server per chosen area', () => {
      const [, file] = buildSessionMcpArgs({ CCG_HOME: home }, 'sess-9', installed);
      const config = JSON.parse(readFileSync(file, 'utf8'));
      expect(Object.keys(config.mcpServers)).toEqual(['swttch_session_mgmt', 'swttch_pr']);
      expect(config.mcpServers.swttch_pr.command).toBe(process.execPath);
      expect(config.mcpServers.swttch_pr.args).toEqual([installed.entry, '--area', 'pr']);
      expect(config.mcpServers.swttch_pr.env).toMatchObject({ SWTTCH_SESSION_ID: 'sess-9', CCG_HOME: home });
    });

    it('adds nothing when no area is chosen', () => {
      expect(buildSessionMcpArgs({ CCG_HOME: home }, 'sess-9', { entry: installed.entry, areas: [] })).toEqual([]);
    });

    it('lets the host variable win, so Swttch Desktop\'s own copy is never replaced', () => {
      const [, file] = buildSessionMcpArgs(env(), 'sess-9', installed);
      const config = JSON.parse(readFileSync(file, 'utf8'));
      expect(config.mcpServers.swttch_session_mgmt.args[0]).toBe('/opt/swttch/session-mcp/src/cli.js');
      expect(Object.keys(config.mcpServers)).toHaveLength(11);
    });
  });
});
