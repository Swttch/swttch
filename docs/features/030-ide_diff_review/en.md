# See the edit in your IDE — and keep only the parts you want

Until now, approving a file edit meant reading one line and guessing:

> **Edit config.txt?**
> 1. Yes 2. Yes, and don't ask again 3. No

That prompt told you the file name. It did not tell you what was about to change
inside it. And if Claude proposed ten changes and eight were right, the only
answers on offer were all or nothing — accept everything and revert by hand
afterwards, or reject everything and ask again.

This release changes both halves of that, in the place you already read code:
your IDE.

## The change opens in the IDE's diff viewer

When Claude asks to edit a file, the change opens in the same side-by-side diff
window you use for version control — original on the left, proposed on the
right, with your editor's syntax highlighting.

The chat prompt is untouched. It still asks the same question with the same
buttons, so nothing you already know how to do has moved.

## Keep some of it, not all of it

When the change touches more than one place in the file, a tick box appears in
the gutter beside each one — right next to the lines it belongs to — with
**Apply** and **Reject** in a bar underneath.

Everything starts ticked, so pressing Apply without touching anything does what
approving always did: the whole edit. Unticking is how you narrow it, and the
button says what it will actually do — *Apply 1 of 2* — so there is no doubt
about what you are agreeing to.

The bar also carries a count of what is kept and a **Select all** / **Clear
all** button, so a change with many parts does not have to be ticked one box at
a time.

Reject answers the same question the other way. Untick everything and Apply
turns itself off: keeping nothing is a rejection, and writing the file back
unchanged would report success for an edit that never happened.

A change confined to one spot has nothing to choose between, so it gets a plain
Apply and Reject.

### What actually gets written

Only the parts you kept. The parts you unticked stay exactly as they are on
disk — not reverted afterwards, but never written in the first place.

Claude is told what was applied, so it carries on from the file as it really is
rather than from what it proposed.

## Turning it off

**Settings → IDE → Show Claude's edits in the IDE diff viewer.** With it off,
nothing opens and the flow is exactly what it was before this release —
including approving from the chat prompt alone.

Running outside an IDE, the option is shown but inactive, since there is no IDE
window to open anything in. Approval there stays whole-file, as it was.

![The IDE settings section with three toggles, the diff-viewer one greyed out](./assets/ide-settings.png)

*Running outside an IDE: the two carried-over settings still work, and only the
new diff option is inactive, with a line saying why.*

## A new IDE section in settings

Two settings that only mean anything inside an IDE — *Attach the editor file by
default* and *Focus chat input after attaching file path* — used to sit under
General, where they were visible to people running in a browser who could never
use them. They have moved to the new **IDE** section, keeping their values.

Related: [#109](https://github.com/Swttch/swttch/issues/109),
[#41](https://github.com/Swttch/swttch/issues/41)
