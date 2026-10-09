# Hide the top bar with `top_bar_display=F`

> Languages: **English** · [한국어](./ko.md)

## What's new

Add **`top_bar_display=F`** to the address of the Claude Code screen in your browser, and the **top bar** is not drawn at all. The chat starts at the very top of the window, 40 pixels higher than before.

It works like an option on the command line: the address says what you want, and nothing needs to be changed in the settings.

Hiding the bar only hides the bar. The tab keeps telling you what the session is doing, exactly as it does with the bar in place (see [What keeps working](#what-keeps-working)).

## How to use it

This is for the **browser** (Standalone mode, opened with the `ccg` command). The IDE builds the address of its own tool window itself, so there is nowhere to type the parameter there.

Add the parameter to the end of the address in the browser's address bar.

- If the address already has a `?` in it, add `&top_bar_display=F` at the end.
- If it has no `?`, add `?top_bar_display=F`.

For example:

```
http://localhost:<port>/sessions/new?workingDir=%2FUsers%2Fyou%2Fproject&top_bar_display=F
```

Then press Enter.

### Before and after

With the top bar, the first line of the window holds the folder icon, the session title and the ⋮ menu:

![The chat with the top bar: a first line with a folder icon, the session title "Question 1: Please explain how the pinne...", a down arrow and a ⋮ button, and under it two banners, "You're signed out of Claude Code." and "Get notified when responses complete".](./assets/top-bar-shown.png)

With `top_bar_display=F`, that line is gone. The banners sit at the very top edge, and the conversation starts directly under them:

![The same chat with top_bar_display=F: no first line; the banners "You're signed out of Claude Code." and "Get notified when responses complete" sit at the top edge, and the first message "Question 1: Please explain how the pinned send header behaves when the page scrolls." follows right under them.](./assets/top-bar-hidden.png)

## Values

| Value in the address | The top bar |
|----------------------|-------------|
| `F`, `f`, `false`, `FALSE`, `0` | Hidden |
| Anything else: `T`, `true`, `1`, an empty value, a misspelling | Shown |
| The parameter is not in the address | Shown |

A misspelling never hides the bar. If the bar is still there, check that the name is written exactly as `top_bar_display`, in lower case, with underscores.

## What disappears with the bar

Everything on that line is not on the screen while the bar is hidden:

- The working directory dropdown and the session dropdown (the session title)
- The ⋮ menu and every icon pinned next to it: usage, scheduled messages, background tasks, the remote tunnel, settings, assets, and opening a new tab
- The account switcher

Everything below the line keeps its place and behaves as before: the conversation, the banners, the composer, the send index on the right edge, and the pinned message at the top of a long reply.

The notices that drop in from the top (toasts) also appear at the top edge instead of 40 pixels below it.

## What keeps working

These things used to be done by the top bar being on the screen. They are now done by the page itself, so they continue while the bar is hidden:

- The **tab title** follows the session title.
- The **tab icon** turns while a response is streaming, and shows the unread and "waiting for your answer" marks.
- The **sound** and the **desktop notification** at the end of a turn.
- The marks in the session lists (running, waiting for your answer, unread) stay in step with this screen.
- Looking at a session marks it as read.

## Good to know

- **The parameter is read once, when the page opens.** Moving around inside the app, such as switching to another session, changes the address and the parameter drops out of it. The bar stays hidden for as long as that page stays open. If you **reload** the page after that, the address no longer has the parameter and the bar comes back. Add the parameter again when you want a hidden bar in a new tab or after a reload.
- **There is no setting for it.** The only switch is the address.
- **Choosing "Resume conversation" from the slash panel does nothing visible while the bar is hidden.** It clears the `/resume` text you typed, and it has nothing to open, because the list it opens belongs to the top bar.
- This page does not change how Swttch looks in the IDE.

## If something does not move up

The bar's height is now written in one place, and the content area, the banners, the toasts, the pinned message and the send index all follow it. If you see something that does not move up with the bar, that is a bug worth reporting.
