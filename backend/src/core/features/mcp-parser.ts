import {
  McpServer,
  McpServerConfig,
  McpServerScope,
  McpServerStatus,
  McpTransportType,
} from '../../shared';

/**
 * Parse the stdout of `claude mcp list` into a lightweight list of names and statuses.
 *
 * Example input line:
 *   playwright: npx @executeautomation/playwright-mcp-server - ✔ Connected
 *   jetbrains: http://localhost:64342/sse (SSE) - ✘ Failed to connect
 */
export function parseMcpList(output: string): Array<{ name: string; status: McpServerStatus }> {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('Checking MCP'))
    .flatMap((line) => {
      const colonIdx = line.indexOf(': ');
      if (colonIdx === -1) return [];
      const name = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 2);
      const dashIdx = rest.lastIndexOf(' - ');
      if (dashIdx === -1) return [];
      const statusPart = rest.slice(dashIdx + 3).trim();
      return [{ name, status: parseStatusText(statusPart) }];
    });
}

/**
 * Parse the stdout of `claude mcp get <name>` into a McpServer object.
 *
 * Example input:
 *   playwright:
 *     Scope: User config (available in all your projects)
 *     Status: ✔ Connected
 *     Type: stdio
 *     Command: npx
 *     Args: @executeautomation/playwright-mcp-server
 *     Environment:
 *
 *   To remove this server, run: claude mcp remove "playwright" -s user
 *
 * Returns null when the output cannot be parsed (empty, malformed, error message).
 */
export function parseMcpGet(output: string): McpServer | null {
  const lines = output.split('\n').map((l) => l.trimEnd());
  if (lines.length === 0) return null;

  // First non-empty line: "<name>:"
  const nameLine = lines[0]?.trim();
  if (!nameLine || !nameLine.endsWith(':')) return null;
  const name = nameLine.slice(0, -1).trim();

  // Collect key: value pairs from indented lines.
  // Handles both "Key: Value" and "Key:" (empty value) forms.
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('To remove')) break;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();
    fields[key] = val;
  }

  const statusRaw = fields['status'] ?? '';
  const status = parseStatusText(statusRaw);
  const scope = parseScopeText(fields['scope'] ?? '');
  const config = buildConfig(fields);

  // CLI does not provide a separate error field — use the status text as the error message
  // when the server is in a failed or auth-required state.
  const statusText = stripStatusIcon(statusRaw);
  const error =
    (status === McpServerStatus.FAILED || status === McpServerStatus.NEEDS_AUTH) && statusText
      ? statusText
      : null;

  return {
    name,
    status,
    scope,
    config,
    tools: [],
    error,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Drop the decorative icon the CLI prints in front of a status word.
 *
 * The icon is not a fixed character. `claude mcp list` prints U+2714 ✔ / U+2718 ✘ on a
 * UTF-8 terminal, but a Windows console running a legacy code page substitutes them with
 * whatever its own character set offers — U+221A √ and U+00D7 × have both been observed
 * (issue #319). Matching against a list of known icons therefore breaks again on every new
 * substitution, so this does the opposite: it keeps nothing but the status wording itself.
 *
 * Every status the CLI reports is ASCII wording ("Connected", "Failed to connect",
 * "needs-auth", …), so everything before the first ASCII letter is decoration and is dropped.
 * When the text carries no ASCII letter at all it is returned trimmed but otherwise intact,
 * leaving the caller to treat it as an unknown status rather than silently emptying it.
 */
function stripStatusIcon(text: string): string {
  const firstLetterIdx = text.search(/[A-Za-z]/);
  if (firstLetterIdx === -1) return text.trim();
  return text.slice(firstLetterIdx).trim();
}

function parseStatusText(text: string): McpServerStatus {
  const t = stripStatusIcon(text).toLowerCase();
  if (t.startsWith('connected')) return McpServerStatus.CONNECTED;
  if (t.startsWith('failed')) return McpServerStatus.FAILED;
  if (t.startsWith('needs-auth') || t.startsWith('needs auth')) return McpServerStatus.NEEDS_AUTH;
  if (t.startsWith('pending') || t.startsWith('connecting')) return McpServerStatus.PENDING;
  if (t.startsWith('disabled')) return McpServerStatus.DISABLED;
  // Unknown status text — treat as failed so the UI doesn't silently show a connected badge.
  return McpServerStatus.FAILED;
}

function parseScopeText(text: string): McpServerScope | string {
  const lower = text.toLowerCase();
  if (lower.startsWith('user')) return McpServerScope.USER;
  if (lower.startsWith('claude.ai')) return McpServerScope.CLAUDEAI;
  if (lower.startsWith('project')) return McpServerScope.PROJECT;
  if (lower.startsWith('local')) return McpServerScope.LOCAL;
  if (lower.startsWith('managed')) return McpServerScope.MANAGED;
  if (lower.startsWith('enterprise')) return McpServerScope.ENTERPRISE;
  // Return raw text so the caller can still group by it.
  return text;
}

function buildConfig(fields: Record<string, string>): McpServerConfig | null {
  const type = fields['type']?.toLowerCase();
  if (!type) {
    // Some servers (e.g. claude.ai connectors, servers added via external tooling)
    // do not expose transport details in `claude mcp get` output.
    return null;
  }

  if (type === 'stdio') {
    const args = fields['args'] ? fields['args'].split(/\s+/).filter(Boolean) : undefined;
    const env = parseEnvLine(fields['environment']);
    return {
      type: McpTransportType.STDIO,
      command: fields['command'] || undefined,
      args: args?.length ? args : undefined,
      env: env && Object.keys(env).length ? env : undefined,
    };
  }

  if (type === 'http') {
    return { type: McpTransportType.HTTP, url: fields['url'] || undefined };
  }

  if (type === 'sse') {
    return { type: McpTransportType.SSE, url: fields['url'] || undefined };
  }

  if (type === 'ws') {
    return { type: McpTransportType.WS, url: fields['url'] || undefined };
  }

  return null;
}

/**
 * Parse the Environment: line from `claude mcp get` output.
 * The format is not yet observed in the wild — kept for future robustness.
 * Returns undefined for empty / absent environment fields.
 */
function parseEnvLine(envText: string | undefined): Record<string, string> | undefined {
  if (!envText || envText.trim() === '') return undefined;
  const result: Record<string, string> = {};
  for (const part of envText.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    result[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
  }
  return result;
}
