# Multi-Account Management

> Languages: **English** · [한국어](./ko.md)
>
> Related: [PR #134](https://github.com/Swttch/swttch/pull/134)

## What's new

Claude Code with GUI now lets you **save multiple Claude accounts and switch between them with a single click.** No more logging out and back in when you move between a work account and a personal one, or run accounts on different plans side by side.

- **Settings → Account**: see your saved accounts at a glance, and switch / add / remove them.
- **Account avatar in the header**: a quick switcher right in the chat view.
- **Settings → Usage**: compare usage across **all** saved accounts on one screen.

## Adding accounts and auto-save

- **Add account**: click **Add account** (top-right of Settings → Account, or in the header dropdown) to run the in-app login. Once login succeeds, that account is **saved to your list automatically**.
- **Auto-capturing the current account**: if you logged in from the terminal with `claude login` and that account isn't in your list yet, it is **registered automatically the moment you open Settings → Account** — no "Save" button to press.

## Switching accounts

- **Header avatar → dropdown**: click another account row to switch instantly. When the switch completes, a toast notification appears at the top of the screen.
- **Settings → Account → Switch**: each account row also has a **Switch** button. The account currently in use is marked **In use**.
- Switching **physically swaps** the live credentials on your system (Keychain on macOS, `.credentials.json` on Linux/Windows). If the swap fails it automatically rolls back, so your login is never left broken.

Each row shows an avatar, the name, **Plan** and **Auth method** badges (hover for a tooltip telling you which is which), the email, and the **last access time**.

## Per-account usage (Settings → Usage)

The Usage page now shows usage for **every saved account at once**, not just the active one. For each account you can see the 5-hour session limit, the weekly (7-day) limit, and their reset times, with a plan badge on the right.

- **Active account**: usage for the currently logged-in account is fetched live.
- **Inactive accounts**: shows the usage **captured the last time that account was active**. The value may therefore be somewhat stale; switching to the account refreshes it. An account that has never been active yet shows *"Switch to this account to load its usage data."*

## Security & privacy

- **OAuth tokens and credentials are never written to any log** anywhere in the pipeline.
- Usage is fetched **only for the currently active account**; every other account uses the cached value described above. No background requests go out to external services on behalf of inactive accounts.
- Usage is cached per account for 5 minutes, so it isn't re-fetched on every message you send. Use the **Refresh button on the Usage page** to force the latest values at any time.

## Notes

- The account list is ordered by **the order you added them**, and stays put even after you switch.
- Saved accounts are kept only on your machine, under `~/.claude-code-gui/accounts/`.
