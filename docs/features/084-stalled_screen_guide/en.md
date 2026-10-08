# The stalled-screen guide, and Reload and Restart in the status bar

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#526](https://github.com/Swttch/swttch/issues/526), [#473](https://github.com/Swttch/swttch/issues/473), [#528](https://github.com/Swttch/swttch/pull/528), [#529](https://github.com/Swttch/swttch/pull/529)

## What's new

Three things changed for the moments when the Claude Code screen does not come up.

- If the screen has not finished loading **30 seconds** after it started, or the browser reports that it could not load it at all, a **guide** takes the place of "Loading the screen...". It has a **Restart** button, tells you to quit the IDE completely and open it again, and walks you through the **IDE setting** that fixes a built-in browser that cannot draw.
- The **status bar** says **Swttch** in front of its dot, and the card it opens has **Reload** and **Restart**.
- If the backend comes back on a different port, the screen **loads again by itself** instead of staying on the old address.

The loading text now says **"(SSH)"** only when the screen is really drawn by a Remote Development client. It used to say so in a local IDE too ([#526](https://github.com/Swttch/swttch/issues/526)).

## The guide

The guide appears in the tab where the screen was loading. It is two cards and a footer, in the order to try them, from the top. Stop as soon as the screen appears.

![The guide in a Claude Code tab: a title, a card "Restart the plugin backend" with a Restart button and the line "If that does not help, quit the IDE completely and open it again", a card "Still not showing after restarting the IDE?" with two tabs, the steps to change the setting and the two lines to paste with a Copy button, and a footer with Copy the information, Open the issue page and Close this guide.](./assets/stalled-guide.png)

It is written in the **interface language you chose in the plugin's settings** (**Settings → General → Interface language**), in all 12 languages the plugin has. Words are never cut in the middle: the page folds at spaces, and only a word wider than the whole line, or text without spaces such as Japanese, is cut by character.

### Restart the plugin backend

**Restart** starts the part of Swttch that works behind the screen again, then loads the screen again. Every Claude Code tab of the same project is loaded again from the new backend.

**Work that is running in another tab of the same project may stop.** Restart is the one step on this page that can interrupt something, so the card says so right under its title.

Under the button the card says: **If that does not help, quit the IDE completely and open it again.** This also starts the IDE's built-in browser from scratch, which a Restart does not.

After a restart the guide waits **60 seconds** instead of 30 before it comes back, so a slow computer is not sent round in circles.

### Still not showing after restarting the IDE?

This card is **open from the start**. Click its title to fold it.

Some computers cannot draw with the built-in browser the way the IDE sets it up. Since IDE 2025.1 the browser runs in a separate process by default, and plugins that draw their screen with it report blank panels on some computers. Two settings help. They are the two **tabs** of the card, and a tab is shown **only while it still has something for you to do**:

| Tab | What it changes |
|-----|-----------------|
| **Browser inside the IDE** | The built-in browser runs inside the IDE's own process again. |
| **No graphics acceleration** | The built-in browser draws with the processor instead of the graphics chip. |

Try the first tab first. Try the second only if the screen still does not appear after the first and a restart. When only one option is left, the tabs give way to a line with that option's name.

Each tab has three steps and the exact lines to paste:

1. Click **Open the settings file**. It opens the same file as **Help → Edit Custom Properties...**. If the file does not exist yet, the IDE creates it.
2. Paste the lines at the end of the file, with the **Copy** button of the box above them. If a line that starts with the same name is already there, change that line instead of adding a second one.
3. Save the file, then quit the IDE completely and open it again. The step names the keys for your system: Cmd+S on macOS, Ctrl+S on Windows and Linux.

Every option lists **all the names the IDE is known to read** for the setting. An IDE ignores a name it does not know, so this does not depend on which name your IDE version reads.

On Linux with native **Wayland**, the first tab starts with a note: with that option the Claude Code screen opens in **its own window** next to the IDE instead of inside it.

#### The guide does not repeat what is already done

The guide looks at your IDE to decide what to show for each option.

| State | What you see | Picture |
|-------|--------------|---------|
| **Not set** | The three steps and the lines to paste | the first picture above |
| **Written in the file, IDE not restarted yet** | Only: "These lines are already in your settings file. Quit the IDE completely and open it again to apply them." | ![The settings card with the first tab showing only the sentence that its lines are already in the settings file.](./assets/stalled-guide-written.png) |
| **Already in effect** | Nothing. The option is left out, and when both are in effect the whole card is gone. | ![The guide with only the restart card and the footer.](./assets/stalled-guide-applied.png) |

The first option is judged by **what the IDE actually does** (whether the built-in browser really runs inside the IDE now), not by a name in a file. The second has no effect that can be observed, so it is judged by its setting.

### The footer

**Copy the information** puts a short text on the clipboard: the plugin and IDE versions, the operating system, the display toolkit, whether the browser runs in a separate process, the settings, whether the backend is running, and how long the screen waited. It has **no code, no conversation, no folder names and no paths.** Hover over the link to read that sentence.

**Open the issue page** opens the [issue page](https://github.com/Swttch/swttch/issues/new) in your browser. Paste the text there.

**Close this guide** takes the guide away when the screen is in fact showing and the guide is only covering it. The guide also goes away **by itself** as soon as the screen finishes loading.

### A narrow window

Every width is worked out from the width of the tool window and worked out again when it changes. The page folds instead of being cut off at the right edge: below 420 px the cards use less padding and a smaller number badge, below 300 px the badge is left out, the tabs stack, and the footer's buttons go onto their own lines.

### When the browser cannot even load the page

If the browser reports that it could not load the screen (for example "This site can't be reached" because the backend does not answer), the guide appears **at once** and **stays**. Before, that error page counted as a finished load and took the guide away, leaving only the browser's own error page. It was found under Remote Development, where a stopped backend produces exactly that page.

## Reload and Restart in the status bar

The status bar now says **Swttch** in front of its dot, so the widget shows whose it is. Clicking the name or the dot opens the same card as before, with two links more:

![The status card: "Claude Code", "running (port 42513)", "1 connection: 1 x IDE panel", "No sessions", the links Open and Copy address, and the links Reload and Restart. Under it, in the status bar, the word Swttch and a green dot.](./assets/status-card.png)

| Link | What it does |
|------|--------------|
| **Reload** | Loads this project's open Claude Code screens again from the backend's **current** port. The backend is left alone and nothing is stopped. It is not available while no screen of the project is open. |
| **Restart** | Restarts this project's backend and loads its screens again. Work in progress in other tabs of the project may stop. It also works when the backend is not running: it starts it. |

They live in the card because the card can be opened even when the screen is blank.

**Reload builds the address anew.** The browser's own refresh would ask the old address again, which is the one thing that does not help when the port is what changed.

**Restart no longer raises the IDE's red error badge.** Stopping the backend closes its output pipe under the plugin's reader, which was logged as an error on every restart. It is now logged as the shutdown it is, and a read error without a shutdown is still an error.

## When the backend moves to another port

A screen keeps asking the address it was loaded from. When the backend comes back on a new port, the screen is left talking to nothing. The plugin now looks at the backend's port every two seconds and, when it has changed on two looks in a row (so a restart that is still settling is not loaded twice), loads the screen again from the new one. You do not have to do anything. This was measured with a test build that moved the port of a running backend, and the screen loaded again from the new one.

An ordinary restart from the IDE asks the backend for the port it had before, so the address usually stays the same and nothing needs loading again. This covers the cases where it did not.

## What this does not do

- **It cannot fix a built-in browser that cannot draw on your computer.** The two settings are known workarounds, not a cure. If they do not help, copy the information and send it to us.
- **It does not catch a browser that finishes loading and then never paints a frame.** The guide appears when the screen has **not finished loading** after 30 seconds, or fails to load. See [The chat tab opens completely empty on Linux](../../troubleshooting/en/linux-jcef-blank-panel.md) for that case.
- **The first option affects the whole IDE.** It turns the separate-process browser off for every feature that uses the built-in browser, not only this plugin.
- **The first option is not offered on Windows with IDE 2025.2.3.** Turning the separate process off there makes pages draw as plain text.
- **The second option can make heavy pages slower**, because the processor draws instead of the graphics chip.
- **Under Remote Development** (PhpStorm 2026.2.3 as the host, JetBrains Client on macOS) the guide appears in the client, and its **Restart** button restarted the backend and loaded the screen again. **Two things were not measured there:** which IDE the **Open the settings file** button opens the file in, and whether the settings change the browser that runs in the client. The status bar card was **not shown in the client** at all, so Reload and Restart of the card are not available there; the guide's own Restart is.
- **It was checked on a local IDE** (IntelliJ IDEA 2026.2.3 on Linux, on Arm), in both browser modes.
- **A guide that covers a working screen** (the screen is fine but did not report that it finished) can be closed with the button above.

## See also

- [The chat tab opens completely empty on Linux](../../troubleshooting/en/linux-jcef-blank-panel.md)
- [Remote Development port forwarding](../073-remote_dev_port_forwarding/en.md)
