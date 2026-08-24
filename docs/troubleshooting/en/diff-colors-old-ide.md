# The review screen has no colour

🌐 **English** | [한국어](../ko/diff-colors-old-ide.md) | [日本語](../ja/diff-colors-old-ide.md) | [中文](../zh/diff-colors-old-ide.md) | [Español](../es/diff-colors-old-ide.md) | [Deutsch](../de/diff-colors-old-ide.md) | [Français](../fr/diff-colors-old-ide.md)

_Last updated: 2026-08-24_

When Claude proposes a file edit we show you the change — but **on IDE 2025.2 and older that screen comes out with no colour.** We have not been able to work around it yet, and updating your IDE fixes it straight away.

## Symptoms

The whole review is drawn in a single colour.

![A review with no colour — the code is all white and the changed lines have no background](../../img/screenshot-diff-colors-missing.png)

- Keywords, strings and numbers are not distinguished — everything is white (or black)
- **Added and removed lines have no background colour.** There is no colour telling you which lines changed
- Line numbers and separators are the same flat tone

This is what it should look like.

![A normal review — syntax highlighting is present and added lines have a green background](../../img/screenshot-diff-colors-ok.png)

The text and the line numbers are all correct, and approving or rejecting works as it always does. **It is harder to read, not broken.**

## Cause

This screen is drawn on **JCEF**, the Chromium-based browser engine inside your IDE. It picks its colours with a CSS feature called `light-dark()` — one line holding both the light-theme and the dark-theme colour, with the browser choosing whichever matches.

That feature needs **Chromium 123 or newer**. Here is what ships inside the IDE:

| IDE version | Chromium | Colour |
|---|---|---|
| 2024.2 – 2025.2 | **122** | missing |
| **2025.3 and newer** | **137** | fine |

One version decides it. On 122 the colour declarations are thrown out entirely, and nothing is left to apply.

Chromium 122 is a March 2024 build. If you have been on the same IDE for a while, the browser engine inside it is that old too.

## What to do

**Update your IDE to 2025.3 or newer.** The latest release is the better choice if you can take it.

- **Help → Check for Updates**
- If you use Toolbox, update from there

Restart the IDE afterwards and the colour is back. No plugin setting needs changing.

You can check your version under **Help → About**.

### If you cannot update

You can review the change in the **IDE's own diff viewer** instead. The IDE draws that one itself, so this does not affect it.

Go to **Settings → Diff View → Review edits in** and choose **IDE diff viewer**.

Note that per-hunk decisions and editing the proposal are not available there — those are ours to offer, and only our screen has them.

## Related links

### Pull requests in this repository

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### External

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — browser support
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — the runtime bundled with the IDE; JCEF lives inside it
