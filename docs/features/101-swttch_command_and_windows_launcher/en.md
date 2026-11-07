# `swttch`: one terminal command for macOS, Linux and Windows

> Issue: [#649](https://github.com/Swttch/swttch/issues/649)

Swttch does not need an IDE. Run one command in a terminal and the same UI the JetBrains plugin shows opens in your browser, backed by the same backend. This page covers the command that does that, `swttch`, how to install it on each operating system (now including **Windows without WSL or Git**), how to stop, update and remove it, and what to do when something goes wrong.

## What changed

- **A new command name, `swttch`.** The command used to be called `ccg`, a leftover of the product's old name (Claude Code with GUI). `swttch browser` does what `ccg` did. `ccg` keeps working, but it is **deprecated**: use `swttch browser` from now on.
- **Windows is supported natively.** A PowerShell one-liner installs a launcher that needs no Git, no bash and no WSL. Before, Windows users had to go through WSL or Git Bash, and in Git Bash `ccg stop` could not stop the backend.
- **The README now explains how to stop and update it**, including what to do when `Ctrl+C` does not end it.

## Install

You need **Node.js 18 or newer** (the backend runs on it) and, as with the plugin, the `claude` command line tool installed and signed in. The installers tell you if Node.js is missing and show how to get it, but they never install it for you.

**macOS, Linux, WSL and Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.ps1 | iex
```

If Node.js is missing the installer prints a warning at the end, for example:

```
WARNING: Node.js 18 or newer was not found on PATH (ccg needs it to run the backend).
  If you already installed it, open a new terminal so PATH is refreshed.
  Otherwise install it from https://nodejs.org/ or run: winget install OpenJS.NodeJS.LTS
```

Open a **new terminal** after installing so the new command is on your `PATH`.

## Start

```bash
cd /path/to/your/project
swttch browser
```

Your default browser opens on `http://localhost:19836/?workingDir=<your folder>`. What happens behind that:

1. If nothing uses port 19836, `swttch browser` downloads the latest runtime from GitHub Releases (about 25 MB, once), starts the backend in the terminal and opens the browser.
2. If the JetBrains plugin or another `swttch browser` already runs the backend on that port, it just opens the browser: the IDE and the terminal share one backend.
3. If the running backend is older than the latest release, it asks `Update now? (y/N)`. The JetBrains plugin itself is **not** updated by this; that stays in the JetBrains Marketplace.
4. If some other program uses port 19836, it stops with `Port 19836 is in use by another process` and does not touch that program.

Options: `-p, --port <n>` (use another port) and `-b, --bind <addr>` (listen on another address; `0.0.0.0` lets other devices on your network reach it, and the backend has no authentication, so only do that on a network you trust).

`swttch desktop` is reserved for the Swttch desktop app and prints `The Swttch desktop app is not available yet.` Typing `swttch` alone only prints the command list, because the browser launcher and the desktop app are equals.

## Stop

Press `Ctrl+C` in the terminal where `swttch browser` runs. If it does not end, open another terminal:

```bash
swttch stop                  # the backend on port 19836 and its child processes
swttch stop --all --force    # EVERY backend, IDE-launched ones too; asks before it kills
swttch list                  # see what is running first (PID, port, who started it)
```

```
Swttch backend processes:
● PID 13924  port 19836 ✔  [prod/standalone]
    node.exe "C:/Users/me/.claude-code-gui/runtimes/0.35.3/backend.mjs"
```

`✔` means the process really answers as a Swttch backend on that port. `swttch stop <pid>`, `--port <n>` and `--no-tree` (end only that one process) also exist.

On Windows, after `Ctrl+C` you may see `Terminate batch job (Y/N)?`. That is Windows itself, because the launcher is a `.cmd` file; answer `Y`. Windows also has no gentle way to ask a background Node.js to quit, so `swttch stop` ends the processes right away.

## Update

Stop the running one first, then:

```bash
swttch self-update    # the command itself (re-runs the installer)
swttch update         # the runtime (backend and web UI)
```

`swttch update` also replaces a runtime with the same version number, in case a release was patched in place.

## Remove

```bash
swttch uninstall
```

This removes the launcher, the downloaded runtimes and the `PATH` entry. **Your data stays**: accounts, settings and licence live in `~/.claude-code-gui` (on Windows `%USERPROFILE%\.claude-code-gui`) and are shared with the JetBrains plugin, so deleting them would log you out of everything. Delete that folder yourself if you want it gone too.

## Each environment, at a glance

| Where you run it | Install | Notes |
|---|---|---|
| macOS, Linux | `curl ... \| bash` | `lsof` is used to find the backend |
| WSL | `curl ... \| bash` inside WSL | Node.js must be on WSL's own `PATH`; a Node.js installed on Windows does not count |
| Git Bash | `curl ... \| bash` | `swttch list` and `stop` work (they read Windows processes) |
| Windows PowerShell or CMD | `irm ... \| iex` | native launcher, no bash needed |

## Limits

- `swttch desktop` does not exist yet.
- The Windows launcher has no account manager (`swttch account`) yet; use the macOS, Linux, WSL or Git Bash one for that.
- The installers never install Node.js or `claude` for you.
- Stopping on Windows ends the backend immediately (see above).

## Troubleshooting

**`swttch: command not found` / `'swttch' is not recognized`.** Open a new terminal; the `PATH` is only read when a terminal starts. On Windows `swttch doctor` (or `ccg doctor`) tells you whether the folder is on your `PATH`.

**`Node.js is not installed or not on PATH`.** Install Node.js 18 or newer and open a new terminal. In WSL it must be installed (or loaded, for example by `nvm`) in WSL itself.

**`Port 19836 is in use by another process`.** Something that is not Swttch holds the port. `swttch stop` will not kill it. Find it (`lsof -i :19836`, on Windows `netstat -ano | findstr :19836`), close it, and run `swttch browser` again, or use `swttch browser -p 20000`.

**The browser opens but the page says it cannot connect.** Run `swttch list`: a `?` instead of `✔` after the port means something listens there that does not answer as Swttch.

**`swttch update` says the port is taken.** The same rule: it only replaces a Swttch backend, never someone else's program.

**Windows says running scripts is disabled.** The launcher starts PowerShell with its own policy setting, so this should not appear. If it does, tell us in an issue with the exact message.
