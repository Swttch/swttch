import { describe, it, expect } from 'vitest';
import { parseMcpList, parseMcpGet } from '../mcp-parser';
import { McpServerStatus, McpServerScope, McpTransportType } from '../../../shared';

// ─── parseMcpList ────────────────────────────────────────────────────────────

describe('parseMcpList', () => {
  const FIXTURE_LIST = `Checking MCP server health…

claude.ai Claude Code Remote: https://api.anthropic.com/v1/code/mcp/meta - ✔ Connected
playwright: npx @executeautomation/playwright-mcp-server - ✔ Connected
vibe_kanban: npx -y vibe-kanban@latest --mcp - ✘ Failed to connect
jetbrains: http://localhost:64342/sse (SSE) - ✘ Failed to connect
slack: npx -y @modelcontextprotocol/server-slack - ✔ Connected
taskmaster-ai: npx -y task-master-ai - ✔ Connected
workspace-mcp: http://localhost:8000/mcp (HTTP) - ✔ Connected`;

  it('extracts all server names', () => {
    const result = parseMcpList(FIXTURE_LIST);
    const names = result.map((r) => r.name);
    expect(names).toEqual([
      'claude.ai Claude Code Remote',
      'playwright',
      'vibe_kanban',
      'jetbrains',
      'slack',
      'taskmaster-ai',
      'workspace-mcp',
    ]);
  });

  it('maps ✔ Connected to CONNECTED', () => {
    const result = parseMcpList(FIXTURE_LIST);
    expect(result.find((r) => r.name === 'playwright')?.status).toBe(McpServerStatus.CONNECTED);
  });

  it('maps ✘ Failed to connect to FAILED', () => {
    const result = parseMcpList(FIXTURE_LIST);
    expect(result.find((r) => r.name === 'vibe_kanban')?.status).toBe(McpServerStatus.FAILED);
    expect(result.find((r) => r.name === 'jetbrains')?.status).toBe(McpServerStatus.FAILED);
  });

  it('handles server names containing dots (claude.ai)', () => {
    const result = parseMcpList(FIXTURE_LIST);
    expect(result.find((r) => r.name === 'claude.ai Claude Code Remote')?.status).toBe(
      McpServerStatus.CONNECTED,
    );
  });

  it('handles args with hyphens without confusing the ` - ` status separator', () => {
    const result = parseMcpList(FIXTURE_LIST);
    expect(result.find((r) => r.name === 'vibe_kanban')?.status).toBe(McpServerStatus.FAILED);
  });

  it('skips the "Checking MCP" header line', () => {
    const result = parseMcpList(FIXTURE_LIST);
    expect(result.some((r) => r.name.startsWith('Checking'))).toBe(false);
  });

  it('returns empty array for empty output', () => {
    expect(parseMcpList('')).toEqual([]);
  });

  it('returns empty array when only header present', () => {
    expect(parseMcpList('Checking MCP server health…\n')).toEqual([]);
  });

  // Issue #319: a Windows console on a legacy code page substitutes the CLI's ✔ / ✘ with
  // characters from its own set. The reporter's screenshot showed U+221A √, which the old
  // parser could not strip, so a connected server was reported as Failed. The status word
  // decides the status; whatever icon precedes it must not.
  describe('status icon substitutions (issue #319)', () => {
    const CONNECTED_ICONS: Array<[string, string]> = [
      ['U+2714 ✔ (UTF-8 terminal)', '✔'],
      ['U+221A √ (Windows code page, reported in #319)', '√'],
      ['U+2713 ✓', '✓'],
      ['U+2705 ✅', '✅'],
      ['no icon at all', ''],
    ];

    it.each(CONNECTED_ICONS)('reads Connected through %s', (_label, icon) => {
      const line = `playwright: npx some-pkg - ${icon}${icon ? ' ' : ''}Connected`;
      expect(parseMcpList(line)[0]?.status).toBe(McpServerStatus.CONNECTED);
    });

    const FAILED_ICONS: Array<[string, string]> = [
      ['U+2718 ✘ (UTF-8 terminal)', '✘'],
      ['U+00D7 × (Windows code page)', '×'],
      ['U+2717 ✗', '✗'],
      ['U+274C ❌', '❌'],
      ['no icon at all', ''],
    ];

    it.each(FAILED_ICONS)('reads Failed to connect through %s', (_label, icon) => {
      const line = `jetbrains: http://localhost:64342/sse (SSE) - ${icon}${icon ? ' ' : ''}Failed to connect`;
      expect(parseMcpList(line)[0]?.status).toBe(McpServerStatus.FAILED);
    });

    it('does not depend on a space between the icon and the status word', () => {
      expect(parseMcpList('playwright: npx some-pkg - √Connected')[0]?.status).toBe(
        McpServerStatus.CONNECTED,
      );
    });

    it('still reports FAILED for status wording it does not recognise', () => {
      expect(parseMcpList('playwright: npx some-pkg - √ Exploded')[0]?.status).toBe(
        McpServerStatus.FAILED,
      );
    });
  });
});

// ─── parseMcpGet ─────────────────────────────────────────────────────────────

describe('parseMcpGet', () => {
  describe('stdio server (playwright)', () => {
    const FIXTURE = `playwright:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: @executeautomation/playwright-mcp-server
  Environment:

To remove this server, run: claude mcp remove "playwright" -s user`;

    it('parses name', () => {
      expect(parseMcpGet(FIXTURE)?.name).toBe('playwright');
    });

    it('parses status as CONNECTED', () => {
      expect(parseMcpGet(FIXTURE)?.status).toBe(McpServerStatus.CONNECTED);
    });

    it('parses scope as USER', () => {
      expect(parseMcpGet(FIXTURE)?.scope).toBe(McpServerScope.USER);
    });

    it('parses stdio config with command and args', () => {
      const config = parseMcpGet(FIXTURE)?.config;
      expect(config?.type).toBe(McpTransportType.STDIO);
      expect(config?.command).toBe('npx');
      expect(config?.args).toEqual(['@executeautomation/playwright-mcp-server']);
    });

    it('returns no env for empty Environment line', () => {
      expect(parseMcpGet(FIXTURE)?.config?.env).toBeUndefined();
    });
  });

  describe('stdio server with multiple args (taskmaster-ai)', () => {
    const FIXTURE = `taskmaster-ai:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: -y task-master-ai
  Environment:

To remove this server, run: claude mcp remove "taskmaster-ai" -s user`;

    it('splits args by whitespace', () => {
      expect(parseMcpGet(FIXTURE)?.config?.args).toEqual(['-y', 'task-master-ai']);
    });
  });

  describe('http server (workspace-mcp)', () => {
    const FIXTURE = `workspace-mcp:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: http
  URL: http://localhost:8000/mcp

To remove this server, run: claude mcp remove "workspace-mcp" -s user`;

    it('parses http config with URL', () => {
      const config = parseMcpGet(FIXTURE)?.config;
      expect(config?.type).toBe(McpTransportType.HTTP);
      expect(config?.url).toBe('http://localhost:8000/mcp');
    });
  });

  describe('sse server (jetbrains)', () => {
    const FIXTURE = `jetbrains:
  Scope: User config (available in all your projects)
  Status: ✘ Failed to connect
  Type: sse
  URL: http://localhost:64342/sse

To remove this server, run: claude mcp remove "jetbrains" -s user`;

    it('parses sse config with URL', () => {
      const config = parseMcpGet(FIXTURE)?.config;
      expect(config?.type).toBe(McpTransportType.SSE);
      expect(config?.url).toBe('http://localhost:64342/sse');
    });

    it('parses status as FAILED', () => {
      expect(parseMcpGet(FIXTURE)?.status).toBe(McpServerStatus.FAILED);
    });
  });

  describe('claude.ai connector (no transport details)', () => {
    const FIXTURE = `claude.ai Claude Code Remote:
  Scope: claude.ai config
  Status: ✔ Connected

To remove this server, run: claude mcp remove "claude.ai Claude Code Remote" -s claudeai`;

    it('parses name correctly (contains dots)', () => {
      expect(parseMcpGet(FIXTURE)?.name).toBe('claude.ai Claude Code Remote');
    });

    it('parses scope as CLAUDEAI', () => {
      expect(parseMcpGet(FIXTURE)?.scope).toBe(McpServerScope.CLAUDEAI);
    });

    it('returns null config when no Type field', () => {
      expect(parseMcpGet(FIXTURE)?.config).toBeNull();
    });

    it('parses status as CONNECTED', () => {
      expect(parseMcpGet(FIXTURE)?.status).toBe(McpServerStatus.CONNECTED);
    });
  });

  describe('server with no type in get output (slack)', () => {
    const FIXTURE = `slack:
  Scope: User config (available in all your projects)
  Status: ✔ Connected

To remove this server, run: claude mcp remove "slack" -s user`;

    it('returns null config when Type is absent', () => {
      expect(parseMcpGet(FIXTURE)?.config).toBeNull();
    });
  });

  describe('hypothetical needs-auth status', () => {
    const FIXTURE = `my-server:
  Scope: User config (available in all your projects)
  Status: needs-auth
  Type: sse
  URL: https://example.com/sse

To remove this server, run: claude mcp remove "my-server" -s user`;

    it('parses needs-auth status', () => {
      expect(parseMcpGet(FIXTURE)?.status).toBe(McpServerStatus.NEEDS_AUTH);
    });
  });

  describe('hypothetical disabled status', () => {
    const FIXTURE = `my-server:
  Scope: User config (available in all your projects)
  Status: disabled
  Type: stdio
  Command: npx
  Args: some-package

To remove this server, run: claude mcp remove "my-server" -s user`;

    it('parses disabled status', () => {
      expect(parseMcpGet(FIXTURE)?.status).toBe(McpServerStatus.DISABLED);
    });
  });

  // Issue #319: the reporter's screenshot showed the error banner reading "√ Connected" —
  // the CLI's own success sentence, icon included, presented as the failure reason. Both the
  // status verdict and the error text come from the same Status line, so both are asserted.
  describe('status icon substitutions (issue #319)', () => {
    const fixture = (statusLine: string) => `plugin:toolsmith:toolsmith:
  Scope: User config (available in all your projects)
  Status: ${statusLine}
  Type: stdio
  Command: npx
  Args: some-pkg

To remove this server, run: claude mcp remove "plugin:toolsmith:toolsmith" -s user`;

    const CONNECTED_ICONS: Array<[string, string]> = [
      ['U+2714 ✔ (UTF-8 terminal)', '✔ Connected'],
      ['U+221A √ (Windows code page, reported in #319)', '√ Connected'],
      ['U+2713 ✓', '✓ Connected'],
      ['no icon at all', 'Connected'],
    ];

    it.each(CONNECTED_ICONS)('reads CONNECTED through %s', (_label, statusLine) => {
      expect(parseMcpGet(fixture(statusLine))?.status).toBe(McpServerStatus.CONNECTED);
    });

    it.each(CONNECTED_ICONS)('reports no error through %s', (_label, statusLine) => {
      expect(parseMcpGet(fixture(statusLine))?.error).toBeNull();
    });

    const FAILED_ICONS: Array<[string, string]> = [
      ['U+2718 ✘ (UTF-8 terminal)', '✘ Failed to connect'],
      ['U+00D7 × (Windows code page)', '× Failed to connect'],
      ['no icon at all', 'Failed to connect'],
    ];

    it.each(FAILED_ICONS)('reads FAILED through %s', (_label, statusLine) => {
      expect(parseMcpGet(fixture(statusLine))?.status).toBe(McpServerStatus.FAILED);
    });

    it.each(FAILED_ICONS)('strips the icon out of the error message for %s', (_label, statusLine) => {
      expect(parseMcpGet(fixture(statusLine))?.error).toBe('Failed to connect');
    });

    it('reads NEEDS_AUTH through a substituted icon', () => {
      const server = parseMcpGet(fixture('√ needs-auth'));
      expect(server?.status).toBe(McpServerStatus.NEEDS_AUTH);
      expect(server?.error).toBe('needs-auth');
    });

    it('reads PENDING through a substituted icon', () => {
      expect(parseMcpGet(fixture('√ Connecting…'))?.status).toBe(McpServerStatus.PENDING);
    });

    it('reads DISABLED through a substituted icon', () => {
      expect(parseMcpGet(fixture('√ disabled'))?.status).toBe(McpServerStatus.DISABLED);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(parseMcpGet('')).toBeNull();
    });

    it('returns null when first line has no trailing colon', () => {
      expect(parseMcpGet('not a server name\n  Scope: User')).toBeNull();
    });

    it('initialises tools as empty array', () => {
      const FIXTURE = `playwright:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: some-pkg`;
      expect(parseMcpGet(FIXTURE)?.tools).toEqual([]);
    });

    it('initialises error as null', () => {
      const FIXTURE = `playwright:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: some-pkg`;
      expect(parseMcpGet(FIXTURE)?.error).toBeNull();
    });
  });
});
