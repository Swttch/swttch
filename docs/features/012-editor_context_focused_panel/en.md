# Editor context follows the focused panel

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#180](https://github.com/Swttch/swttch/issues/180), [#199](https://github.com/Swttch/swttch/issues/199), [#205](https://github.com/Swttch/swttch/issues/205), [#204](https://github.com/Swttch/swttch/pull/204), [#207](https://github.com/Swttch/swttch/pull/207)

## What's new

When you had **more than one Claude Code panel open** (several editor tabs, a
tool window, or a browser tab), attaching editor context misbehaved: selecting
a line showed the file badge on **every** panel, and `Alt+K` / right-click
"Send to Claude Code" inserted the mention into the wrong panel or spawned a
brand-new tab (issues #180, #199, #205).

Now editor context — both the automatic **file badge** and the explicit
**`Alt+K` mention** — goes only to the **panel you last focused**, and revealing
the chat follows that same panel instead of always popping something in the IDE.

## What you see

- **Select a line / `Alt+K`** → the file badge and the mention land on **the
  panel you're actually looking at**, not on every open panel.
- **Open a second editor tab** → it connects immediately; no more "403 ·
  Forbidden" on the new tab (the tab reuses the host's already-authenticated
  session).
- **Open the session in your browser** (Remote Control ⌘-click) → it connects,
  and two browser tabs are told apart correctly.
- **Tool-window mode + `Alt+K`** → focuses the existing Claude panel instead of
  stacking a new editor tab on every press.
- **Last focused a browser tab, then `Alt+K`** → the mention goes to that
  browser tab and the IDE is left alone (no tool window pops open). If the
  last-focused Claude was an IDE panel, that panel is focused (reopening it if
  its tool window was hidden); if nothing is open, a fresh tab opens.

## How it works

- **One identity per panel.** Each panel is tracked by a single stable id
  (`panelId`), shared across the IDE and the Node backend, so the backend can
  map "the focused panel" straight back to the exact IDE tab. A browser tab
  mints its own id in-memory, so tabs never collide however they were opened.
- **Focus history.** The webview reports focus (window focus, input focus, or a
  click) to the backend, which keeps a small stack of recently-focused panels.
  Dead panels are pruned automatically, so the top is always live and the panel
  you focused before closing one resurfaces on its own.
- **Scoped routing.** Panel-scoped pushes (file badge / mention) are sent only
  to the top of that stack, falling back to a broadcast when no focus is known
  yet — so a payload is never lost. `Alt+K` reveal reads the same source: focus
  the target IDE panel, do nothing for a browser tab, or open a fresh tab when
  nothing is focused.
- **Session reuse across tabs.** The per-launch auth token is shared across the
  panels of one client so a new tab reuses the paired session; the system
  browser, a separate client, redeems its own short-lived pairing code. Pairing
  stays required everywhere — only credential reuse is fixed.

Everything is driven by the panels' own focus signals and the backend's routing
— no official SDK and no undocumented protocol.
