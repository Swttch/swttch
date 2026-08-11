# MCP Server Management

> Languages: [한국어](./ko.md) · **English**
>
> Related: [PR #136](https://github.com/Swttch/swttch/pull/136)

## What's new

You can now **view, add, edit, remove, enable, disable, and reconnect MCP servers directly from the GUI** — no terminal required. Type `/MCP Servers` in the slash-command palette (or click the **MCP Servers** item under Customize) to open the panel.

## Features

### Server list

Servers are grouped by scope (Project → Local → User → claude.ai) and sorted alphabetically within each group. Each card shows:

- **Server name** (monospace)
- **Status badge** — solid-pill colour coding:
  - Green "✓ Connected"
  - Red "✗ Failed"
  - Yellow "Needs auth"
  - Grey text "Pending" / "Disabled" (no badge)

### Detail view

Click any server card to open its detail screen:

- **Edit** — a chip next to the status badge opens the add form prefilled with the server's current configuration. Available for user / project / local scope servers (claude.ai connectors are managed elsewhere and can't be edited here). Because the CLI has no dedicated edit command, saving runs `claude mcp remove` followed by `claude mcp add-json`; if the re-add fails, the original config is restored so a failed edit never deletes your server. Servers that are **Failed or Pending can be edited too** — their config is recovered from the settings file even when the CLI doesn't report it.
- **Error box** — displayed above the server name when the server is in a failed or auth-required state. For SSE / HTTP servers, the GUI probes the endpoint directly and surfaces the real network error (e.g. "connection refused") instead of the generic "Failed to connect".
- **Action buttons** (in priority order):
  1. **Authenticate** (primary / blue CTA) — visible when the server supports OAuth and is failed or needs-auth.
  2. **Reconnect** — re-runs `claude mcp get <name>` to attempt a fresh connection. While reconnecting the button shows "Reconnecting" and all other buttons are disabled.
  3. **Clear authentication** — visible for connected OAuth servers (except claude.ai proxy).
  4. **Enable / Disable** — toggles the server in `disabledMcpServers` without removing its config.
- **Remove server** — confirms before calling `claude mcp remove`.

### Add / edit a server

Click **+** in the modal header to open the add form, or **Edit** on a server to change an existing one. Give the server a name, pick a scope (user / project / local), and paste its configuration as JSON — either a single server config or a full `mcpServers` wrapper. Add submits via `claude mcp add-json`. You can also browse the **MCP registry** (search icon in the header) to pick a server and prefill the form.

While a save is in progress the whole modal is locked (inputs disabled, can't be closed or dismissed), the **Save button turns into a spinner**, and a toast confirms the result on completion (**"Added …"** / **"Saved …"**).

### Pre-fetch & caching

The server list is fetched as soon as the chat page mounts (React Query, `staleTime: 0`, `gcTime: 5 min`), so opening the modal for the first time shows data immediately instead of a loading spinner.

## Implementation notes

- All data comes from **`claude mcp list`** (health-check + name enumeration) and **`claude mcp get <name>`** (per-server status) — no undocumented internal protocols.
- **Workspace-relative commands**: every MCP CLI command (`list` / `get` / `add-json` / `remove`) runs in the open project's root directory — the same working directory chat uses. Project- and local-scope configs (`.mcp.json` / per-project config) are resolved relative to that directory, so they are written and read in the right place rather than the backend's own folder.
- **Config recovery for non-connected servers**: `claude mcp get` omits transport details for Failed/Pending servers (and drops headers/env even when present), which would leave them non-editable. The GUI instead reads the original config **verbatim** from its settings file — `~/.claude.json` (user), `{project}/.mcp.json` (project), or the per-project entry in `~/.claude.json` (local) — preserving env and headers. This is what lets you view and edit servers that aren't currently connected.
- SSE / HTTP error enrichment: when a server is failed, the backend makes a 5-second `fetch` probe to the server URL and replaces the generic status text with the actual network error.
- Disabled servers are sourced from `~/.claude.json → disabledMcpServers`; the CLI does not report them in `mcp list`.
- IPC message types live in the shared `MessageType` enum (`GET_MCP_SERVERS`, `RECONNECT_MCP_SERVER`, `AUTHENTICATE_MCP_SERVER`, `CLEAR_MCP_SERVER_AUTH`, `SET_MCP_SERVER_ENABLED`, `ADD_MCP_SERVER`, `REMOVE_MCP_SERVER`).
