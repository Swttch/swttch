# The chat tab opens completely empty on Linux

🌐 **English** | [한국어](../ko/linux-jcef-blank-panel.md) | [日本語](../ja/linux-jcef-blank-panel.md) | [中文](../zh/linux-jcef-blank-panel.md) | [Español](../es/linux-jcef-blank-panel.md) | [Deutsch](../de/linux-jcef-blank-panel.md) | [Français](../fr/linux-jcef-blank-panel.md)

_Last updated: 2026-09-08_

## Symptoms

The chat tab opens, but the inside of it is completely blank.

The text `Waiting for project indexing...` appears for a moment, disappears, and nothing takes its place.

No error message and no guidance panel is shown. The tab simply stays empty.

## Check this first

Open any `.md` file in the same IDE and turn on its Markdown preview.

**If the Markdown preview is blank as well, this document is for you.**

That preview is drawn by the IDE itself, not by this plugin. When both go dark at the same time, the problem is in the IDE's embedded browser (JCEF) rather than in any single plugin.

This one check saves a lot of time, because a blank chat tab and a broken JCEF look identical from the outside.

## Affected environments

This happens on Linux.

It has been confirmed on Ubuntu 22.04 with PhpStorm 2026.2.2, on a machine using an NVIDIA graphics card in a Wayland session.

The reporter had changed several JCEF registry flags away from their defaults, to work around a different Wayland problem.

Two things make this more likely:

- a **Wayland** session rather than X11
- the proprietary **NVIDIA** driver

## Cause

This plugin draws its chat UI on **JCEF** (Chromium Embedded Framework), which is the same component the IDE uses for its Markdown preview and its built-in browser.

JCEF renders through the GPU. When that path does not work on a given driver and session combination, the browser is created successfully but no frame is ever painted, so the panel stays empty.

We do not catch this case yet. When JCEF is unusable, or when our backend fails to start, we replace the placeholder with a panel that explains what happened. A JCEF that starts normally and then never paints looks like success from our side, which is why you get a blank tab with no message.

## How to fix it

Try these in order. Step 1 is what fixed the reported case.

### 1. Put the JCEF registry flags back to their defaults

Open `Help → Find Action`, run **Registry…**, and search for `jcef`.

Check these four entries and restore any that are no longer at their default value.

| Entry | Default |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

An entry that has been changed is shown in bold, and the Registry dialog has a **Restore Defaults** button.

Restart the IDE afterwards.

Flags that were set to work around some other Wayland problem are a common reason for landing here.

### 2. Switch the session to X11

Log out, and pick an **X11** (or "Xorg") session at the login screen instead of Wayland.

If you would rather keep the desktop on Wayland, you can move just the IDE onto XWayland. Open `Help → Edit Custom VM Options`, add the line below, and restart.

```
-Dawt.toolkit.name=XToolkit
```

If a line starting with `-Dawt.toolkit.name=` is already there, replace it.

### 3. Only if the first two did not help, turn GPU acceleration off

This is the opposite direction from step 1, so try it only after step 1 has failed.

In **Registry…**, set `ide.browser.jcef.gpu.disable` to `true` and restart.

JetBrains suggested exactly this to a reporter whose embedded browser came up empty, and it made the render appear ([IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)).

## What to keep in mind

**Write down the original value before you change any registry entry.** These flags affect every part of the IDE that uses the embedded browser, not just this plugin.

Moving to X11 or XWayland puts the IDE back on the older display path. **The screen may look blurry if you use fractional scaling such as 125% or 150%.** It is a workaround, and you can revert it.

Turning GPU acceleration off makes JCEF render on the CPU, which can be slower on heavy pages.

## If none of it helps

JetBrains asks for a verbose JCEF log in this situation.

Add the line below in `Help → Edit Custom VM Options`, restart, reproduce the empty tab, and collect `~/jcef_<PID>.log`.

```
-Dide.browser.jcef.log.level=verbose
```

Please attach that file when you [open an issue](https://github.com/Swttch/swttch/issues/new/choose), along with your distribution, your session type (Wayland or X11), and your graphics driver.

## When will this go away

It becomes unnecessary once JCEF renders reliably on these driver and session combinations.

The tickets below are still open, and voting on them helps raise their priority.

We are also looking at whether the plugin can detect a browser that never paints and say so on screen, instead of leaving you with an empty tab.

## Related links

### Issues in this repository

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### JetBrains tickets

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — an embedded browser that comes up empty on Linux, traced to a VA-API error. **Still open, and you can vote on it.** JetBrains suggested `ide.browser.jcef.gpu.disable` here, and the reporter confirmed it worked
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — GPU acceleration breaking JCEF on Linux with the NVIDIA driver, and the request for a reliable way to turn it off. **Still open**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — native Wayland support itself, still in progress
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — the same white-screen symptom, closed as Incomplete because there was not enough information

### Related documents

- [Wayland clipboard](wayland-clipboard.md) — the other Wayland problem, where pasting into the chat input fails
