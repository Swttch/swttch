# `/reload-plugins` and `/btw` work in the GUI

Two slash commands that work in the terminal did nothing here. Typing
`/reload-plugins` answered:

> /reload-plugins isn't available in this environment.

And before that, it never appeared in the command list while you typed, so there
was no sign it existed at all. `/btw` was missing the same way.

Both now run from the GUI, appear in the command list, and show their result in
the chat.

## What they do

| Command | What it does |
| --- | --- |
| `/reload-plugins` | Activates pending Claude Code plugin changes in the current session — after installing, updating, or editing a plugin, this picks it up without restarting |
| `/btw <question>` | Asks a quick side question without disturbing the main conversation |

`/reload-plugins` reports which plugins are active afterwards, and says so when
any of them failed to load. The command list refreshes at the same time, so
commands and agents a reloaded plugin brings with it are immediately available.

`/btw` takes your question as its argument (`/btw what does this flag do?`) and
answers in the chat, leaving the main conversation where it was.

## Why they were missing

Nothing here filtered them out — they never arrived.

The GUI runs the Claude Code CLI as a **non-interactive** session, and the CLI
marks certain built-in commands as terminal-only. For those, it does two things:
it leaves them out of the command list it sends us, and it refuses them with
"isn't available in this environment" if the text is sent anyway. That is the
message the report showed.

The CLI does accept a direct request for the same work, which is how its own
non-terminal clients run these commands. The GUI now makes that request over the
channel it already uses to drive the CLI, so the command does what it does in the
terminal.

If that request can't be delivered, the command is sent as plain text instead —
you then get the CLI's own answer rather than silence.

## What did not change

`/context` and `/usage` are untouched. The CLI already offers both to the GUI,
and each has its own presentation here — `/context` renders as the context-usage
card, `/usage` opens the account modal. They keep working exactly as before.

---

Reported in [#270](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/270).
