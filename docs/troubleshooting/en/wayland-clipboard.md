# Pasting does not work when the JetBrains IDE runs on Wayland

🌐 **English** | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_Last updated: 2026-10-05_

## Symptoms

Pasting into the plugin's chat input fails silently.

No error message appears.

There is one telling detail.

Text copied from **inside** the plugin pastes fine, while text copied from **outside** it — a browser, a terminal, the IDE editor — fails.

Pasting works normally in the same IDE's code editor and search fields.

This is not limited to text. **Images such as screenshots fail the same way.**

## Affected environments

This happens on Linux, in a Wayland session, when the IDE itself runs as a native Wayland program.

The default `-Dawt.toolkit.name=auto` setting can pick that mode, and `WLToolkit` forces it.

So far it has been reported on Fedora 44, Ubuntu 26.04, and CachyOS, all on the KDE Plasma desktop.

We reproduced the same symptom in a test session on the sway compositor, with IDE 2025.3.4 and with IDE 2026.2.3.

One reporter switched to GNOME and the problem went away.

## Cause

The plugin's screen is drawn by JCEF, the browser engine inside the IDE.

In the IDEs we tested (2025.3.4 and 2026.2.3), JCEF runs as a separate process, and that process reaches the display through XWayland, the compatibility layer for X11 programs.

The IDE window itself is a native Wayland window.

Text copied outside the plugin sits on the Wayland clipboard.

XWayland hands the Wayland clipboard to X11 programs only while an X11 window has the focus.

The IDE window is a Wayland window, so that handover never happens, and JCEF sees an empty clipboard.

Text copied inside the plugin lands on the X11 clipboard, which is why that text pastes fine.

We measured this handover on three compositors: sway, KWin 5.27.5, and KWin 6.7.5 (Plasma 6.7, the same series as on Fedora 44).

On all three, an X11 program could not read the Wayland clipboard while a Wayland window had the focus, and could read it while an X11 window had the focus.

With `-Dawt.toolkit.name=XToolkit`, the IDE window itself becomes an X11 window, so the clipboard is handed over and pasting works.

The same symptom is reported in other JetBrains plugins that use JCEF.

The IDE process itself can read that clipboard, so newer plugin versions ask the IDE for it whenever a paste arrives empty, and the paste then works without any setting.

If you are on an older version, or a paste still fails, use the setting below.

## How to fix it

Open `Help → Edit Custom VM Options`, add the line below, and restart the IDE.

```
-Dawt.toolkit.name=XToolkit
```

If you already have a line starting with `-Dawt.toolkit.name=` (such as `auto` or `WLToolkit`), replace that line with the one above.

Three people have each confirmed that this works, on three different distributions.

## What to keep in mind

This setting puts the IDE back on XWayland.

So **the screen may look blurry if you use fractional scaling such as 125% or 150%.**

It is a temporary workaround, not a real fix.

If the blurriness bothers you more than the paste problem, you can revert the setting.

One user on Arch Linux (omarchy) reported that with this setting the IDE's floating windows, such as popups, appear in the wrong place.

We could not reproduce that on sway, where menus and popups opened in the right place even at 150% scaling.

If you see it, please tell us which desktop or compositor you use.

## When will this go away

It becomes unnecessary once JetBrains' native Wayland support is stable.

The related ticket [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) is still open.

Voting on it helps raise its priority.

## Related links

### Issues in this repository

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### JetBrains tickets

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — the JCEF clipboard problem. **Still open, and you can vote on it**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — closed as a "Third-Party problem", treated as a KDE bug
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — Wayland clipboard support, marked Fixed in 2024
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — cannot copy from a JCEF preview on Arch/Hyprland
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — native Wayland support itself is still in progress
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — the original report about the Continue plugin, closed as a duplicate of JBR-5857

### The same symptom in other plugins

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — open
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — the maintainer [commented](https://github.com/cline/cline/issues/8383#issuecomment-4173099236) that it cannot be fixed on the plugin side
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — reported on Fedora 43/44, Arch, Kubuntu 26.04, and more
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### External references

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — the KDE bug JetBrains pointed to when closing JBR-10222. Note that it was already fixed in Plasma 6.2.0, and the reporters here are on later versions
