# swttch — Swttch (ex - Claude Code with GUI), in your terminal

`swttch` is a tiny launcher that runs the **same backend** as the JetBrains plugin from a regular terminal, then opens the UI in your default browser. No npm. No Docker. Just one line.

> `ccg` was the previous name of this command. It still works, but it is **deprecated**: use `swttch browser` instead.

**macOS, Linux, WSL, Git Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.ps1 | iex
```

Both need **Node.js 18 or newer** and warn you if it is missing; they never install it for you (macOS: `brew install node`, Windows: `winget install OpenJS.NodeJS.LTS`, or https://nodejs.org/).

After installation, open any project directory and run:

```bash
cd /path/to/your/project
swttch browser
```

Your browser opens at `http://localhost:19836/?workingDir=<your-cwd>`.

## How it works

1. `swttch browser` probes port **19836**.
2. If a compatible backend is already running → opens the browser. Done.
3. If outdated → asks whether to update (the JetBrains plugin is **not** affected).
4. If the port is free → downloads the latest runtime from GitHub Releases, spawns it in the foreground, opens the browser.

The same port (19836) is shared with the JetBrains plugin, so opening the IDE or the terminal — whichever is first — wins. The other side simply attaches.

## Commands

`swttch` on its own only prints help: the browser launcher and the future desktop app are peers.

| Command             | What it does |
|---------------------|--------------|
| `swttch browser`    | Probe port → version-check → spawn → open browser. Options: `-p/--port <n>`, `-b/--bind <addr>`. |
| `swttch desktop`    | Reserved for the desktop app (not available yet). |
| `swttch list`       | Show the backend process tree (PIDs, ports, source labels). |
| `swttch update`     | Force-update the runtime to the latest release. |
| `swttch stop`       | Stop the backend on port 19836, child processes included. Options: `--all` (every backend, IDE-launched ones too; asks first), `--force` (SIGKILL immediately), `<pid>`, `--port <n>`, `--no-tree`. |
| `swttch version`    | Show installed swttch, cached runtimes, and running backend. |
| `swttch doctor`     | Diagnose environment (node, PATH, cache, port). |
| `swttch self-update`| Re-run the installer to update swttch itself. |
| `swttch uninstall`  | Remove swttch from this machine. |

Run `swttch --help` for the list and `swttch <command> -h` for the options of one command. The deprecated `ccg` takes the same commands (`ccg` alone is `swttch browser`).

## What gets installed

```
~/.claude-code-gui/
├── bin/swttch, bin/ccg  # added to your PATH (macOS, Linux, WSL, Git Bash)
├── win/                 # the Windows (PowerShell) launcher; win\bin is added to your user PATH
├── lib/*.sh             # helper modules
├── locales/{en,ko}.sh   # i18n message catalogs
└── runtimes/<version>/  # cached backend + webview (one per version)
```

On macOS, Linux, WSL and Git Bash the installer appends an idempotent block to your shell rc:

```
# claude-code-gui (ccg) ↓ DO NOT EDIT
export PATH="$HOME/.claude-code-gui/bin:$PATH"
# claude-code-gui (ccg) ↑
```

Supported shells: **zsh**, **bash** (auto-configured). Fish users get a one-line instruction (`fish_add_path`).

## Windows

- **PowerShell / CMD**: the installer above sets up the native launcher (no bash needed). Press `Ctrl+C` to stop it; Windows then asks `Terminate batch job (Y/N)?` — answer `Y` (every `.cmd` launcher does this).
- **Git Bash / WSL**: the `curl | bash` line works as on Linux. Node.js must be on the `PATH` of that shell (WSL has its own: a Node.js installed on Windows does not count).
- Windows has no graceful stop signal for a console-less Node.js, so `swttch stop` ends the processes right away.

## Important: relationship with the JetBrains plugin

`swttch update` only updates the **terminal launcher's runtime**. The JetBrains IDE plugin itself must be updated via the JetBrains Marketplace (Settings → Plugins → Updates).

## Languages

The CLI auto-detects locale from `$LANG` / `$LC_ALL` (Windows: the system language). Override with `CCG_LANG`:

```bash
CCG_LANG=ko swttch browser   # Korean
CCG_LANG=en swttch browser   # English (default)
```

Currently shipped: **English** (`en`), **Korean** (`ko`). Adding a language is one new file in [locales/](locales/) (and [win/locales/](win/locales/) for the Windows launcher).

## Requirements

- **node ≥ 18** (the runtime is `backend.mjs`)
- macOS / Linux / WSL / Git Bash: **bash 3.2+** (macOS default is fine), **curl** + **tar**, **lsof** (or **netstat**) for port introspection
- Windows PowerShell: Windows 10 1803 or later (`tar.exe` ships with it)

## Uninstall

```bash
swttch uninstall
```

Removes the launcher, the downloaded runtimes and the PATH entry (the block in `~/.zshrc` / `~/.bashrc`, or your user PATH on Windows). Your data in `~/.claude-code-gui/` (accounts, settings, licence) is shared with the JetBrains plugin and is kept; delete that folder yourself to remove it too.

## Development

The CLI is Bash with bats tests (the Windows launcher in `win/` is PowerShell). See [CLAUDE.md](CLAUDE.md) for the full domain doc (architecture, TDD rules, i18n conventions).

```bash
# Run the test suite
./scripts/build.sh cli-test

# Or directly
./cli/run-tests.sh

# Build the release assets locally
./scripts/build.sh standalone-tgz   # backend + webview (Standalone runtime)
./scripts/build.sh ccg-cli-tgz      # cli files
```
