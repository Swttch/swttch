# Developer tools moved off F12 and into settings

Once you had opened the chat panel, every `Alt+F12` after that opened the
DevTools window instead of the IDE terminal. In WebStorm `Alt+F12` is the
built-in shortcut for the Terminal tool window, and it had stopped working.

DevTools are now bound to **no key at all**. You open them from
Settings → IDE integration → **Developer tools** → **Open**.

## What changed

| | Before | Now |
| --- | --- | --- |
| `F12` | Opened DevTools | Does whatever your IDE does |
| `Alt+F12` | Opened DevTools | Opens the Terminal tool window |
| To open DevTools | `F12` | Settings → IDE integration → Developer tools → **Open** |

The button opens the same DevTools window as before, in its own window. Only the
way in changed; the tools themselves are unchanged.

If you are using the app in a browser, this button appears disabled. Use your
browser's own developer tools there.

## Why we changed it

Searching the keymap did nothing, and turning off the registry key
(`ide.browser.jcef.contextMenu.devTools.enabled`) did nothing either. The person
who reported this had already tried both — and neither one touches this path.

The chat is drawn by an embedded browser whose key handler sits **below
IntelliJ's shortcut system**. Anything it takes never reaches the IDE, so
whatever the IDE has bound to F12 simply never fires, and no IDE setting can
give it back.

Our first thought was to keep F12 and pass only the modified combinations
through. Measuring what the key actually delivers ruled that out: **F12 on its
own already opened DevTools and the terminal at the same time.** F12 is a key the
IDE already uses, so anything we bind there competes with a shortcut that is not
ours.

So instead of refining the condition, we dropped the key entirely. DevTools are
not something you open often, and giving the keyboard back is worth more than
saving a few clicks.

## Notes

- This applies when running inside a JetBrains IDE.
- Issue: [#333](https://github.com/Swttch/swttch/issues/333)
