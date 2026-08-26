# Naming a chat tab yourself

With several sessions open at once, the tab labels were not always enough to tell which tab was doing what.

A tab's label follows its conversation title automatically. That title comes from the first message, so two tabs working on completely different things often ended up with similar names — and there was no way to pick your own.

From this release you can **give a tab a name of your own.**

## How to rename

Right-click the tab and pick **Rename Session...**

It is there for editor tabs and tool window tabs alike.

![The rename dialog. The field holds the tab's current name, with a note below saying that leaving it empty goes back to following the conversation title](./assets/rename-dialog.png)

Type a name, confirm, and the tab is renamed.

## Going back to the automatic name

In the same dialog, **empty the field and confirm.**

The tab goes back to following the conversation title. Useful when the name you picked no longer matches what you are actually doing.

## Names belong to conversations

This is the part worth knowing: **a name attaches to the conversation the tab is showing, not to the tab itself.**

So it behaves like this:

| What you do | The tab label |
|---|---|
| Name a tab while on conversation A | The name you gave |
| Switch that tab to conversation B | B's name — A's does not follow |
| Switch back to A | The name you gave A, still there |
| Open A in a different tab | The same name there too |

If the name stuck to the tab instead, every conversation you later opened in it would inherit that label. Since the reason to name a tab is to tell your work apart, that would achieve the opposite.

## Naming a tab before the conversation starts

You can also name a tab that has not started a conversation yet — one still showing `Claude Code`.

Send the first message from that tab and **the conversation that starts inherits the name.**

This is for when you know what you are about to work on and want to label it up front. If you reset to a new session instead of starting one, the name does not carry over.

## It survives a restart

Names are stored, so they are still on your tabs after the IDE restarts.

Related: [#301](https://github.com/Swttch/swttch/issues/301) · [#362](https://github.com/Swttch/swttch/pull/362)
