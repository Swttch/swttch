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

## How versions are checked

Available versions come from the **npm registry** (`npm view @anthropic-ai/claude-code dist-tags`), which is the canonical source for the stable/latest release numbers regardless of how you installed. The check runs quietly when you open About; the current version comes from `claude --version`.

## Notes

- This works across macOS, Linux, WSL, and Windows, using the same command-resolution the plugin already uses to run the CLI.
- The version is a single shared value across the app, so refreshing it in one place updates it everywhere.
