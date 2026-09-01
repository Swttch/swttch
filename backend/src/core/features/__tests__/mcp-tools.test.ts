import { describe, it, expect } from 'vitest';
import { mapMcpTool, buildTransport } from '../mcp-tools';
import { McpTransportType } from '../../../shared';
import type { McpServerConfig } from '../../../shared';

describe('mapMcpTool', () => {
  it('keeps only the name when no annotations are present', () => {
    expect(mapMcpTool({ name: 'playwright_navigate' })).toEqual({ name: 'playwright_navigate' });
  });

  it('omits the annotations object when annotations is empty', () => {
    expect(mapMcpTool({ name: 't', annotations: {} })).toEqual({ name: 't' });
  });

  it('maps readOnlyHint -> readOnly', () => {
    expect(mapMcpTool({ name: 't', annotations: { readOnlyHint: true } })).toEqual({
      name: 't',
      annotations: { readOnly: true },
    });
  });

  it('maps destructiveHint -> destructive', () => {
    expect(mapMcpTool({ name: 't', annotations: { destructiveHint: true } })).toEqual({
      name: 't',
      annotations: { destructive: true },
    });
  });

  it('maps both hints together', () => {
    expect(
      mapMcpTool({ name: 't', annotations: { readOnlyHint: false, destructiveHint: true } }),
    ).toEqual({ name: 't', annotations: { readOnly: false, destructive: true } });
  });
});

describe('buildTransport', () => {
  // Expansion source; empty because these cases only assert transport selection.
  const noEnv = {};

  it('returns a transport for a stdio server with a command', async () => {
    const config: McpServerConfig = {
      type: McpTransportType.STDIO,
      command: 'npx',
      args: ['@executeautomation/playwright-mcp-server'],
    };
    expect(await buildTransport(config, noEnv)).not.toBeNull();
  });

  it('returns null for a stdio server without a command', async () => {
    expect(await buildTransport({ type: McpTransportType.STDIO }, noEnv)).toBeNull();
  });

  // `type` is optional for a stdio server in .mcp.json and routinely omitted —
  // the docs' examples and the report in #364 both list only command/args/env.
  // Falling through to `default` returned no transport, so the panel showed a
  // connected server with an empty tool list and no error (verified in browser).
  it('treats a server with no explicit type as stdio when it has a command', async () => {
    const config = { command: 'npx', args: ['some-mcp-server'] } as unknown as McpServerConfig;
    expect(await buildTransport(config, noEnv)).not.toBeNull();
  });

  it('still returns null when there is neither a type nor a command', async () => {
    expect(await buildTransport({} as unknown as McpServerConfig, noEnv)).toBeNull();
  });

  it('returns a transport for an http server with a url', async () => {
    expect(await buildTransport({ type: McpTransportType.HTTP, url: 'http://localhost:8000/mcp' }, noEnv)).not.toBeNull();
  });

  it('returns a transport for an sse server with a url', async () => {
    expect(await buildTransport({ type: McpTransportType.SSE, url: 'http://localhost:64342/sse' }, noEnv)).not.toBeNull();
  });

  it('returns null for http/sse without a url', async () => {
    expect(await buildTransport({ type: McpTransportType.HTTP }, noEnv)).toBeNull();
    expect(await buildTransport({ type: McpTransportType.SSE }, noEnv)).toBeNull();
  });

  it('returns null for claudeai-proxy (needs OAuth, not directly probeable)', async () => {
    expect(await buildTransport({ type: McpTransportType.CLAUDEAI_PROXY, url: 'https://example' }, noEnv)).toBeNull();
  });
});
