# Several projects in one repository, reachable from one place

Some repositories keep a handful of sub-projects under `packages/`.

Until now the session dropdown showed only **one level down**. A project two levels deep, like `packages/claude-code-battery`, never appeared at all — reaching it meant going back through "Browse all".

Three things changed.

## The tree goes as deep as your projects do

There is no depth limit any more. Two levels or seven, they all show up.

Folders in between are drawn too, even when no session ever ran in them, so the nesting still reads as a tree. `packages` below is one of those — **muted, with a hollow folder icon**, and not clickable.

Branch glyphs (`├─`) are gone; folder icons and a disclosure arrow take their place, the same vocabulary the JetBrains project tree uses.

- **Filled folder** — a project with actual sessions. Its session count sits on the right
- **Hollow, muted folder** — a path segment that only carries the structure. Not clickable

Arrows fold and unfold a branch, and everything starts expanded. The fold is not remembered: it is a way to read the tree in front of you, not a preference.

The panel widens with its contents, up to the width of the window. On mobile it spans the screen from the start.

## Conversations from nested projects, in one list

Turn on **"Include nested"** at the top of the dropdown and conversations from every project below the one you are browsing are merged into a single list.

In a merged list each row names **which project it belongs to**, on its own line above the title.

This setting is remembered, so switching it on once is enough.

### Opening a nested conversation keeps your place

This is the part worth knowing.

Open a conversation from `packages/active-cli-sdk` and the dropdown **still shows the repository root**. Only the selection moves onto the row that conversation belongs to.

So the wider view you were browsing stays put as you move between conversations. The conversation itself runs in the project folder it came from, as it should.

Starting a fresh conversation with `/clear` behaves the same way.

## Search covers project names too

Typing a project name into the session search finds it. A fragment is enough — `active`, or `packages/`.

It is treated exactly like the title and the session id, so it works whether or not "Include nested" is on.

## The side panel behaves the same

All of the above applies to **both the session dropdown at the top and the session panel on the left** — the two share one list.
