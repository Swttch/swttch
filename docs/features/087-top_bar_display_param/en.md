# Hide the top bar with `is_desktop=1`

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#536](https://github.com/Swttch/swttch/pull/536)

## What's new

Add **`is_desktop=1`** to the address of the Claude Code screen in your browser, and the **top bar** is not drawn at all. The chat starts at the very top of the window, 40 pixels higher than before.

The name says what the page is: the chat view that the Desktop app shows inside its own window. The Desktop app draws its own header, so the page leaves the top bar out and gives the room above the "Claude Code" logo of an empty chat back (see [The logo of an empty chat](#the-logo-of-an-empty-chat)). Those two are all that change.

It works like an option on the command line: the address says what you want, and nothing needs to be changed in the settings.

Hiding the bar only hides the bar. The tab keeps telling you what the session is doing, exactly as it does with the bar in place (see [What keeps working](#what-keeps-working)).

## How to use it

This is for the **browser** (Standalone mode, opened with the `ccg` command) and for the Desktop app, which adds the parameter to every chat view it opens. The IDE builds the address of its own tool window itself, so there is nowhere to type the parameter there.

Add the parameter to the end of the address in the browser's address bar.

- If the address already has a `?` in it, add `&is_desktop=1` at the end.
- If it has no `?`, add `?is_desktop=1`.

For example:

```
http://localhost:<port>/sessions/new?workingDir=%2FUsers%2Fyou%2Fproject&is_desktop=1
```

Then press Enter.

### Before and after

With the top bar, the first line of the window holds the folder icon, the session title and the ⋮ menu:

![The chat with the top bar: a first line with a folder icon, the session title "Question 1: Please explain how the pinne...", a down arrow and a ⋮ button, and under it two banners, "You're signed out of Claude Code." and "Get notified when responses complete".](./assets/top-bar-shown.png)

With `is_desktop=1`, that line is gone. The banners sit at the very top edge, and the conversation starts directly under them:

![The same chat with is_desktop=1: no first line; the banners "You're signed out of Claude Code." and "Get notified when responses complete" sit at the top edge, and the first message "Question 1: Please explain how the pinned send header behaves when the page scrolls." follows right under them.](./assets/top-bar-hidden.png)

## Values

| Value in the address | The top bar |
|----------------------|-------------|
| `1`, `true`, `TRUE`, `t`, `T` | Hidden |
| Anything else: `0`, `false`, `f`, an empty value, a misspelling | Shown |
| The parameter is not in the address | Shown |

A misspelling never hides the bar. If the bar is still there, check that the name is written exactly as `is_desktop`, in lower case, with an underscore.

### The older name `top_bar_display=F` still works

Before this name existed, the same switch was written `top_bar_display=F`. Desktop apps that were already installed still open the chat with that spelling, so it keeps hiding the bar.

| Value in the address | The top bar |
|----------------------|-------------|
| `top_bar_display=F`, `f`, `false`, `FALSE`, `0` | Hidden |
| `top_bar_display=` with anything else | Shown |

When both names are in the address, the bar is hidden if either one asks for it.

## What disappears with the bar

Everything on that line is not on the screen while the bar is hidden:

- The working directory dropdown and the session dropdown (the session title)
- The ⋮ menu and every icon pinned next to it: usage, scheduled messages, background tasks, the remote tunnel, settings, assets, and opening a new tab
- The account switcher

Everything below the line keeps its place and behaves as before: the conversation, the banners, the composer, the send index on the right edge, and the pinned message at the top of a long reply.

The notices that drop in from the top (toasts) also appear at the top edge instead of 40 pixels below it.

## The logo of an empty chat

A chat that has no message yet shows the "Claude Code" logo at the top. With the bar in place the logo sat 40 pixels lower than it does without it, and with nothing above it the logo looks stuck to the top edge.

When the address says **`is_desktop=1`**, the logo is moved down by the height of the bar again, to the place it had with the bar drawn. Nothing else moves: a conversation, once it has begun, still starts at the very top.

Only `is_desktop=1` does this. A browser that hides the bar with the older `top_bar_display=F` keeps the logo where it was, because that name asks for the bar to be hidden and says nothing about who is showing the page.

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
