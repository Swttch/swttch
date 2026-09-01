import { describe, it, expect } from 'vitest';
import { toMcpServers } from '../mcp-status';
import type { McpStatusEntry } from '../mcp-status';
import { McpServerScope, McpServerStatus, McpTransportType } from '../../../shared';

/**
 * Fixtures below are trimmed from a real `control_request{subtype:"mcp_status"}`
 * reply (CLI 2.1.x), so the field names and the exact status/scope words are the
 * CLI's own rather than ones invented for the test.
 */
describe('toMcpServers', () => {
  it('maps a connected stdio server, keeping the words the CLI used', () => {
    const entry: McpStatusEntry = {
      name: 'playwright',
      status: 'connected',
      scope: 'user',
      config: { type: McpTransportType.STDIO, command: 'npx', args: ['playwright-mcp-server'] },
      serverInfo: { name: 'playwright-mcp', version: '1.0.11' },
      tools: [{ name: 'start_codegen_session', annotations: {} }],
    };
    expect(toMcpServers([entry])).toEqual([
      {
        name: 'playwright',
        status: McpServerStatus.CONNECTED,
        scope: McpServerScope.USER,
        config: { type: McpTransportType.STDIO, command: 'npx', args: ['playwright-mcp-server'] },
        tools: [{ name: 'start_codegen_session', annotations: {} }],
        error: null,
        serverInfo: { name: 'playwright-mcp', version: '1.0.11' },
      },
    ]);
  });

  it('carries claudeai scope and the needs-auth status through unchanged', () => {
    const entry: McpStatusEntry = {
      name: 'claude.ai Google Drive',
      status: 'needs-auth',
      scope: 'claudeai',
      config: { type: McpTransportType.CLAUDEAI_PROXY, url: 'https://example', id: 'drive' },
    };
    const [server] = toMcpServers([entry]);
    expect(server.status).toBe(McpServerStatus.NEEDS_AUTH);
    expect(server.scope).toBe(McpServerScope.CLAUDEAI);
  });

  it('keeps the disabled status the CLI reports rather than recomputing it', () => {
    const [server] = toMcpServers([{ name: 'vibe_kanban', status: 'disabled', scope: 'user' }]);
    expect(server.status).toBe(McpServerStatus.DISABLED);
  });

  it('preserves annotations the UI does not render yet, openWorld included', () => {
    const [server] = toMcpServers([
      {
        name: 'notion',
        status: 'connected',
        scope: 'claudeai',
        tools: [{ name: 'notion-search', annotations: { readOnly: true, openWorld: true } }],
      },
    ]);
    expect(server.tools).toEqual([
      { name: 'notion-search', annotations: { readOnly: true, openWorld: true } },
    ]);
  });

  it('reports an unrecognised status as failed rather than as connected', () => {
    // Never show a connected badge for a state we did not understand.
    const [server] = toMcpServers([{ name: 'x', status: 'something-new', scope: 'user' }]);
    expect(server.status).toBe(McpServerStatus.FAILED);
  });

  it('keeps an unrecognised scope verbatim so the list can still group by it', () => {
    const [server] = toMcpServers([{ name: 'x', status: 'connected', scope: 'brand-new-scope' }]);
    expect(server.scope).toBe('brand-new-scope');
  });

  it('gives an entry with no tool list an empty one, meaning asked and none', () => {
    // The reply always speaks for the running CLI, so "no tools" here is an
    // answer. That is what stops the detail view from opening its own connection.
    const [server] = toMcpServers([{ name: 'x', status: 'connected', scope: 'user' }]);
    expect(server.tools).toEqual([]);
  });

  it('reports a missing config as null, which is what the list shape expects', () => {
    const [server] = toMcpServers([{ name: 'x', status: 'connected', scope: 'user' }]);
    expect(server.config).toBeNull();
  });
});
