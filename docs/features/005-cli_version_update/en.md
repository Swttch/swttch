# Claude Code CLI Version & Update

> Languages: **English** · [한국어](./ko.md)
>
> Related: [PR #150](https://github.com/Swttch/swttch/pull/150)

## What's new

Claude Code with GUI now shows the **installed Claude Code CLI version** and lets you **update it right from Settings → About** — no dropping to a terminal.

The key detail: it updates the CLI **the same way you installed it**. If you installed with volta, it runs `volta install`; with npm, `npm install -g`; with the native installer, `claude update`; with Homebrew or WinGet, their upgrade command. So the CLI you actually run gets updated in place — it never quietly installs a second copy with the wrong package manager.

## Where to find it

- **Settings → About → Claude Code Version** — shows the current version, with an **Update** control on its left when a newer version is available.
- **Slash command panel footer** — the `Claude Code <version>` text is now clickable to re-check the version (same as the refresh button in About). The plugin version next to it is unrelated and stays plain text.

## Updating

When a newer version exists, an **Update** control appears next to the version.

![Update dropdown showing Stable and Latest with per-channel status icons](../../img/screenshot-cli-update-dropdown.png)

Its shape depends on how the CLI was installed:

- **npm / pnpm / yarn / volta** → a **dropdown** where you pick a channel:
  - **Stable** — about a week behind, skips releases with major regressions.
  - **Latest** — the newest release.
  - Each row shows the target version and an icon: a **download** icon to upgrade, an **undo** icon if it would be a downgrade, and a **green check** for the version you already have (that row isn't clickable).
- **native installer / Homebrew / WinGet** → a single **Update** button that moves you to the latest of your channel (these methods don't take a specific version).

Before running, a dialog confirms the update — **updating replaces the CLI and can interrupt running Claude sessions.** While it runs, the control shows a spinner. On success you get a toast and the displayed version refreshes automatically.

![Success toast: Claude Code v2.1.197 Updated](../../img/screenshot-cli-update-toast.png)

Once you're on the newest release, the button is replaced by a static **Up to date** note.

![Up to date state](../../img/screenshot-cli-up-to-date.png)

## When there's no Update button

If the CLI was installed in a way that has **no safe, non-interactive update path** — a Linux system package manager (`apt`/`dnf`/`apk`, which need `sudo`), or a location we can't attribute to a known installer — **no Update control is shown.** This is deliberate: it's safer to show nothing than to run the wrong command and leave you with a duplicate installation. Update those the way you installed them.

## Background update

Claude Code updates itself in the background, but only inside an interactive `claude` session in a terminal. The plugin runs the CLI as `claude -p`, where that updater never starts, so a CLI you only use through the plugin stayed on the same version until you updated it yourself.

The backend now does what the interactive CLI would, and it does it by pressing the Update button above for you. It sends itself the same two requests the About screen sends when you click Update: first the one that reads the installed version and the stable and latest releases, then the update request itself, with the version to install. Both enter the backend the way a click does, so every install method the button can update is updated the same way, with the same command: the native installer, npm, pnpm, yarn, volta, Homebrew and WinGet.

It updates when all of these are true:

- Claude Code's own auto-updates are on (see the switch below).
- The release on your update channel is newer than the installed version. A CLI ahead of the `stable` channel is never moved back.
- The Update button would be shown for this install method.

### When it checks

The interactive CLI looks for an update when it is launched, and the plugin's counterpart of launching `claude` is a chat starting one. So the backend checks shortly after it starts and whenever a chat starts `claude`, at most once every 30 minutes. There is no timer: a backend nobody is chatting in does not reach the registry or run an update on its own, and the check runs beside the chat rather than in front of it, so a chat never waits for it.

### Running sessions are not interrupted

An update never stops a chat that is already running. The running `claude` keeps the version it started with, and the next chat starts the new one. Open tabs refresh the version shown in Settings → About.

This holds because every install method ships `claude` as a single executable, and on macOS and Linux an update replaces that file rather than rewriting it, so a process already running from it is unaffected. Windows cannot replace an executable while it runs, so there an npm, pnpm, yarn, volta or WinGet update waits until no `claude.exe` is running anywhere, from any project or terminal, and happens at the first check after that. A native install on Windows updates through `claude update`, which installs each version side by side and needs no such wait.

One backend runs per open project, so only one of them updates at a time; the others see the update and skip theirs.

### Turning it on or off, and choosing a channel

Settings → About has an **Auto-update Claude Code** row with a switch and, beside it, an update channel. Both are Claude Code's own settings, not plugin ones, and the row carries the badge that marks Claude Code settings:

- Turning the switch off writes `"env": {"DISABLE_AUTOUPDATER": "1"}` into your user settings file (`~/.claude/settings.json`, or the one under `CLAUDE_CONFIG_DIR`). Turning it on removes that key again, leaving the rest of the file as it was.
- The channel is `autoUpdatesChannel` in the same file. **Latest** gets every release as soon as it is published, and is what Claude Code uses when nothing is set, so choosing it removes the key. **Stable** gets releases that have been out for a while. `rc` is listed only when your settings already name it. The channel can be changed only while auto-updates are on.

Because these are the same settings, they also govern `claude` updating itself in the terminal, and the row follows the file when you edit it by hand.

If something the switch does not own keeps auto-updates off, the switch is shown off and cannot be changed, and hovering it says where the setting comes from: a variable in the environment (a shell profile, for instance), another variable such as `DISABLE_UPDATES` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` in `settings.json`, managed settings an administrator controls, or `"autoUpdates": false` in `~/.claude.json`. These are read by the same rules `claude doctor` applies.

`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` limits Claude Code to the traffic a prompt needs, which also turns Claude Code's auto-updates off. It has its own switch, **Block nonessential traffic** at the bottom of the General section under Settings → General, so it can be lifted without a terminal, even when it was exported in a shell profile: the switch then writes an empty value into `settings.json`, which Claude Code applies over the environment. When that is what keeps auto-updates off, the tooltip here points to it. Only managed settings cannot be changed from the plugin.

What it does not do:

- It keeps no setting of its own. A variable exported only in your shell profile may not reach an IDE launched from the desktop; the switch writes to the settings file, which applies however the IDE was started.
- A project's `.claude/settings.json` is not consulted, because the CLI is shared by every project.
- If the check or the update fails (offline, for instance), the backend logs it and tries again the next time a chat starts `claude` after the 30 minutes have passed.

## How versions are checked

Available versions come from the **npm registry** (`npm view @anthropic-ai/claude-code dist-tags`), which is the canonical source for the stable/latest release numbers regardless of how you installed. The check runs quietly when you open About; the current version comes from `claude --version`.

## Notes

- This works across macOS, Linux, WSL, and Windows, using the same command-resolution the plugin already uses to run the CLI.
- The version is a single shared value across the app, so refreshing it in one place updates it everywhere.

## Installed dependencies update at startup

The backend now checks the installed **`@swttch/extend-kit` dependency** once at
startup and updates it to the latest release in the background when a newer
version exists. This companion supplies usage-battery and voice-input commands.
This startup check does not update the plugin; the Claude Code CLI has its own
background update, described above.

If you have never installed the companion, startup skips it. Install it first
using the existing usage or voice-input controls when you want those features.
The check does not hold up the chat interface.

Updates reuse the package-manager command construction and process launcher used
by the Claude CLI update controls above. The target is the companion installation
the backend actually found, including its global package store. For npm, the
update pins that store's prefix; for pnpm and Yarn, it verifies the reported global
store before proceeding. An ambiguous or unsupported installation is skipped
rather than updated in a different location.

If the registry cannot be reached, the installation cannot be identified safely,
or the update fails, startup continues and records the result in the backend log.
The automatic check runs once per backend start; manual dependency controls remain
available. Manual install/removal waits for any startup update already in progress.
After a successful update the backend re-reads the installed version and refreshes
the shared dependency state, so the displayed version follows the active copy.
