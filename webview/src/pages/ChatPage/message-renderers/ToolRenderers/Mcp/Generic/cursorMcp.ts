/**
 * Parsing helpers for the generic MCP fallback renderer.
 *
 * The input preview mirrors the rules of Anthropic's official Claude Code
 * VSCode/Cursor extension; the header label (`server: tool`) follows the desktop
 * app. They live apart from the project's own
 * `formatMcpToolName` (in `../_common`) — that one stays as-is for the dedicated
 * renderers; these are scoped to the fallback only.
 */

const MCP_PREFIX = 'mcp__';

/**
 * Input keys, in priority order, scanned to build the dim header preview shown
 * after the label. The first key holding a non-empty string wins.
 *
 * Cursor's list also had `text`, and `command` came up in #596; neither is here,
 * because the desktop app shows no preview for them: a `command` is already in
 * the card's own code box, and a `text` is just one more input field.
 */
const INPUT_PREVIEW_KEYS = [
    'query',
    'message',
    'channel',
    'repo',
    'url',
    'path',
    'title',
    'search',
] as const;

export function isMcpToolName(name: string): boolean {
    return typeof name === 'string' && name.startsWith(MCP_PREFIX);
}

/** First `__`-separated segment after the `mcp__` prefix (the server). */
export function mcpServerName(name: string): string {
    if (!isMcpToolName(name)) return '';
    return name.slice(MCP_PREFIX.length).split('__')[0] ?? '';
}

/**
 * Everything after the server segment, re-joined by `__` so a tool name that
 * itself contains `__` is preserved (e.g. `mcp__s__foo__bar` → `foo__bar`).
 */
export function mcpToolName(name: string): string {
    if (!isMcpToolName(name)) return '';
    return name.slice(MCP_PREFIX.length).split('__').slice(1).join('__');
}

/**
 * Build the `server: tool` header label the way the desktop app writes it: the
 * server and the tool each with their underscores read as spaces
 * (`mcp__ccd_session_mgmt__archive_session` → `ccd session mgmt: archive session`;
 * hyphens stay, `mcp__shell-sandboxed__run_command` → `shell-sandboxed: run command`).
 * Falls back to the raw name when the input is not a well-formed mcp name (no
 * prefix, or missing server/tool).
 */
export function mcpHeaderLabel(name: string): string {
    const server = mcpServerName(name).replace(/_+/g, ' ').trim();
    const tool = mcpToolName(name).replace(/_+/g, ' ').trim();
    if (!server || !tool) return name;
    return `${server}: ${tool}`;
}

function truncate(value: string, max: number): string {
    return value.length > max ? value.slice(0, max) + '…' : value;
}

/**
 * Derive the dim header preview from a tool's input object, matching Cursor:
 *   - scan `INPUT_PREVIEW_KEYS` in order, take the first non-empty string
 *   - `channel` → `#<value>`
 *   - `url` → hostname (falls back to a 30-char truncation if unparseable)
 *   - otherwise → 40-char truncation
 * Returns null when no priority key holds a string.
 */
export function mcpInputPreview(input: Record<string, unknown> | undefined | null): string | null {
    if (!input || typeof input !== 'object') return null;
    for (const key of INPUT_PREVIEW_KEYS) {
        const value = input[key];
        if (typeof value !== 'string' || !value) continue;
        if (key === 'channel') return `#${value}`;
        if (key === 'url') {
            try {
                return new URL(value).hostname;
            } catch {
                return truncate(value, 30);
            }
        }
        return truncate(value, 40);
    }
    return null;
}
