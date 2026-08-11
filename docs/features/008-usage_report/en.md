# Usage breakdown in the account modal

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#148](https://github.com/Swttch/swttch/issues/148)

## What's new

Typing `/usage` used to be sent straight to the CLI, which just echoed the raw
usage text back as a chat reply — not what you'd expect (issue #148). Now
`/usage` opens the **Account & Usage modal**, the same as picking
"Account & usage…" from the palette, matching the Cursor extension.

The modal also gains a **"Contributing to usage"** section: the detailed
breakdown that `claude -p "/usage"` produces, rendered as UI instead of plain
text.

## What you see

Below the existing session / weekly limit bars, the modal now shows — per period
(**Last 24h** / **Last 7d**, switchable via tabs):

- **request / session counts** for the period
- **insight lines** — e.g. "97% of your usage came from subagent-heavy sessions",
  "66% of your usage was at >150k context"
- **top breakdowns** — top skills, subagents, plugins, and MCP servers, each with
  its share of usage

A refresh button fetches the latest, and the whole section falls back to the raw
text if the CLI output format ever changes.

## How it works

- `/usage` typed alone — or as `/usage …` with anything after a space — opens the
  modal instead of going to the CLI. `/usageX` with no space is a different word
  and is sent as a normal message.
- The breakdown comes from running the official
  `claude --no-session-persistence -p "/usage"` — exactly what a terminal user
  gets. There's no dependency on an SDK or any undocumented protocol; the raw
  text is parsed in the UI.
- The report tracks the **active account**: switching accounts refreshes it, even
  within the same project directory.
- Because `/usage` consumes usage itself, the report is cached briefly; the
  refresh button forces a fresh fetch that bypasses the cache.
