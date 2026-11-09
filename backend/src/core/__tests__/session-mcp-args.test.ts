import { describe, it, expect } from 'vitest';
import { buildSessionMcpArgs } from '../claude-process';

// The session-management MCP is handed to the CLI the documented way (`--mcp-config`), and only
// when a host that ships it says where it is. Plugin and standalone runs never set the variable,
// so for them nothing changes.
describe('buildSessionMcpArgs', () => {
  it('adds nothing when no host named the server', () => {
    expect(buildSessionMcpArgs({}, 'sess-1')).toEqual([]);
    expect(buildSessionMcpArgs({ SWTTCH_SESSION_MCP_BIN: '' }, 'sess-1')).toEqual([]);
  });

  it('adds one --mcp-config whose servers run the named program once per area, told which session is calling', () => {
    const args = buildSessionMcpArgs({ SWTTCH_SESSION_MCP_BIN: '/opt/swttch/session-mcp/src/cli.js' }, 'sess-1');
    expect(args[0]).toBe('--mcp-config');
    expect(args).toHaveLength(2);
    const config = JSON.parse(args[1]);
    expect(Object.keys(config.mcpServers)).toEqual([
      'swttch_session_mgmt', 'swttch_session', 'swttch_sidebar', 'swttch_window', 'swttch_view', 'swttch_host',
      'swttch_pr', 'swttch_settings', 'swttch_directory', 'swttch_connectors', 'swttch_turn',
    ]);
    const server = config.mcpServers.swttch_session_mgmt;
    expect(server.command).toBe('node');
    expect(server.args).toEqual(['/opt/swttch/session-mcp/src/cli.js', '--area', 'session_mgmt']);
    expect(server.env.SWTTCH_SESSION_ID).toBe('sess-1');
  });

  it('uses the node the host names, and hands the data and config folders on', () => {
    const args = buildSessionMcpArgs({
      SWTTCH_SESSION_MCP_BIN: '/x/cli.js',
      SWTTCH_SESSION_MCP_NODE: '/usr/local/bin/node',
      CCG_HOME: '/home/u/.swttch',
      CLAUDE_CONFIG_DIR: '/home/u/.claude-alt',
      ELECTRON_RUN_AS_NODE: '1',
    }, 'sess-2');
    const server = JSON.parse(args[1]).mcpServers.swttch_sidebar;
    expect(server.command).toBe('/usr/local/bin/node');
    expect(server.env).toEqual({ SWTTCH_SESSION_ID: 'sess-2', CCG_HOME: '/home/u/.swttch', CLAUDE_CONFIG_DIR: '/home/u/.claude-alt', ELECTRON_RUN_AS_NODE: '1' });
  });

  it('serves only the areas the host lists', () => {
    const args = buildSessionMcpArgs({ SWTTCH_SESSION_MCP_BIN: '/x/cli.js', SWTTCH_SESSION_MCP_AREAS: 'sidebar, session_mgmt' }, 'sess-3');
    expect(Object.keys(JSON.parse(args[1]).mcpServers)).toEqual(['swttch_sidebar', 'swttch_session_mgmt']);
  });

  it('leaves out an area name that is not a plain identifier, so nothing odd reaches the command line', () => {
    const args = buildSessionMcpArgs({ SWTTCH_SESSION_MCP_BIN: '/x/cli.js', SWTTCH_SESSION_MCP_AREAS: 'sidebar,../evil, a b' }, 'sess-4');
    expect(Object.keys(JSON.parse(args[1]).mcpServers)).toEqual(['swttch_sidebar']);
  });
});
