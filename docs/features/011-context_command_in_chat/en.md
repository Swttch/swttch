# Context usage in chat

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#196](https://github.com/Swttch/swttch/issues/196), [#198](https://github.com/Swttch/swttch/pull/198)

## What's new

Typing `/context` used to show **nothing** in the chat — the response was
silently dropped (issue #196). Now it works, and the reply is rendered as a
**context usage card** that mirrors the native `claude` terminal output as
closely as possible: the same grid, the same category breakdown, the same
trees — right inside the GUI.

## What you see

When you send `/context`, the card shows:

- **Header**: the model display name (e.g. `Opus 4.8 (1M context)`) with the
  model id beneath it, and a token summary (`28.2k/1m tokens (3%)`).
- **Usage grid**: the context window drawn as a matrix of unicode cells —
  `⛁` filled cells colored per category, `⛶` empty cells for free space —
  aligned exactly like the terminal.
- **Category breakdown**: inline `⛁ System prompt: 2.6k tokens (0.3%)` lines
  under an *Estimated usage by category* heading, in the CLI's own order.
- **Detail sections as trees**: MCP Tools, Custom Agents, Memory Files and
  Skills — each with its path subtitle (`· /mcp`, `· .claude/agents/`,
  `· /memory`, `· /skills`) and grouped by source, with token costs in muted
  text.
- **MCP Tools** are grouped per server, collapsed by default, each server
  showing its tool count; expand to see every tool with its token cost.

### Show the original response

A **Show original response** toggle in the card header switches to the
untouched CLI Markdown. That keeps the raw output one click away, and means
the card degrades gracefully if the upstream format ever changes.

## How it works

- `/context` is a client-side command that the Claude Code CLI renders itself.
  We run the CLI in stream-json mode and forward `/context` as a normal
  message — no private protocol, no separate invocation. The CLI answers with
  a complete Markdown response (tables for each section).
- Unlike a normal turn, such local commands emit the `assistant` result with
  **no partial streaming events**, which exposed a render race that dropped
  the content. That was fixed by capturing the streaming target before React
  flushed the update.
- The card **parses that Markdown in the webview** and reconstructs the native
  TUI layout. The backend and transport are never edited — the raw Markdown is
  delivered as-is (original-data preservation), and the "Show original
  response" view renders exactly what the CLI sent. If parsing ever fails, the
  card falls back to plain Markdown.

This keeps `/context` fully CLI-equivalent: what you'd see in the terminal,
you now see in the GUI — reconstructed from the CLI's own output, not from any
official SDK or undocumented protocol.
