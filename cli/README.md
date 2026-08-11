# ccg — Swttch (ex - Claude Code with GUI), in your terminal

`ccg` is a tiny shell launcher that runs the **same backend** as the JetBrains plugin from a regular terminal, then opens the UI in your default browser. No npm. No Docker. Just `curl`.

```bash
curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
```

After installation, open any project directory and run:

```bash
cd /path/to/your/project
ccg
```

Your browser opens at `http://localhost:19836/?workingDir=<your-cwd>`.

## How it works

1. `ccg` probes port **19836**.
2. If a compatible backend is already running → opens the browser. Done.
3. If outdated → asks whether to update (the JetBrains plugin is **not** affected).
4. If the port is free → downloads the latest runtime from GitHub Releases, spawns it in the foreground, opens the browser.

The same port (19836) is shared with the JetBrains plugin, so opening the IDE or the terminal — whichever is first — wins. The other side simply attaches.

## Commands

| Command          | What it does |
|------------------|--------------|
| `ccg`            | Default. Probe port → version-check → spawn → open browser. |
| `ccg update`     | Force-update the runtime to the latest release. |
| `ccg stop`       | Gracefully stop the backend on port 19836. |
| `ccg version`    | Show installed ccg, cached runtimes, and running backend. |
| `ccg doctor`     | Diagnose environment (node, PATH, cache, port). |
| `ccg self-update`| Re-run the installer to update ccg itself. |
| `ccg uninstall`  | Remove ccg from this machine. |

## What gets installed

```
~/.claude-code-gui/
├── bin/ccg              # added to your PATH
├── lib/*.sh             # helper modules
├── locales/{en,ko}.sh   # i18n message catalogs
└── runtimes/<version>/  # cached backend + webview (one per version)
```

The installer appends an idempotent block to your shell rc:

```
# claude-code-gui (ccg) ↓ DO NOT EDIT
export PATH="$HOME/.claude-code-gui/bin:$PATH"
# claude-code-gui (ccg) ↑
```

Supported shells: **zsh**, **bash** (auto-configured). Fish users get a one-line instruction (`fish_add_path`).

## Important: relationship with the JetBrains plugin

`ccg update` only updates the **terminal launcher's runtime**. The JetBrains IDE plugin itself must be updated via the JetBrains Marketplace (Settings → Plugins → Updates).

## Languages

The CLI auto-detects locale from `$LANG` / `$LC_ALL`. Override with `CCG_LANG`:

```bash
CCG_LANG=ko ccg            # Korean
CCG_LANG=en ccg            # English (default)
```

Currently shipped: **English** (`en`), **Korean** (`ko`). Adding a language is one new file in [locales/](locales/).

## Requirements

- **bash 3.2+** (macOS default is fine — no `brew install bash` needed)
- **node ≥ 18** (the runtime is `backend.mjs`)
- **curl** + **tar** (standard on macOS / Linux)
- **lsof** or **netstat** (for port introspection)

Windows native is not supported in this version. Use WSL or git-bash as a best-effort.

## Uninstall

```bash
ccg uninstall
```

Removes `~/.claude-code-gui/` and strips the PATH block from `~/.zshrc` / `~/.bashrc`.

## Development

The CLI is pure Bash with bats tests. See [CLAUDE.md](CLAUDE.md) for the full domain doc (architecture, TDD rules, i18n conventions).

```bash
# Run the test suite
./scripts/build.sh cli-test

# Or directly
./cli/run-tests.sh

# Build the release assets locally
./scripts/build.sh standalone-tgz   # backend + webview (Standalone runtime)
./scripts/build.sh ccg-cli-tgz      # cli files
```
