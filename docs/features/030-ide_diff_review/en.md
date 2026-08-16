# See the edit — and keep only the parts you want

Until now, approving a file edit meant reading one line and guessing:

> **Edit config.txt?**
> 1. Yes 2. Yes, and don't ask again 3. No

That prompt told you the file name. It did not tell you what was about to change
inside it. And if Claude proposed ten changes and eight were right, the only
answers on offer were all or nothing — accept everything and revert by hand
afterwards, or reject everything and ask again.

This release changes both halves of that.

## The change now appears in the prompt

When Claude asks to edit a file, the prompt shows the change itself: removed
lines in red, added lines in green, with a few lines of surrounding context so
you can see where in the file you are.

![The approval prompt showing both changes a Write would make, each with a checkbox, both ticked](./assets/all-selected.png)

*Every change ticked — approving now applies the whole edit, exactly as before.*

Nothing else about the prompt moved. The buttons are where they were, the
keyboard shortcuts are the same, and a prompt for anything that is not a file
edit — a shell command, say — looks exactly as it did.

## Keep some of it, not all of it

When a change touches more than one place in the file, each place gets its own
checkbox.

Everything starts ticked, so an approval you do not think about behaves exactly
as it always did: the whole edit goes through. Unticking is how you narrow it.
As soon as you untick something, the approve button says what it will actually
do — *Yes — apply 1 of 2 changes* — so there is no doubt about what you are
agreeing to.

![The same prompt with the second change unticked and dimmed, the approve button now reading "Yes — apply 1 of 2 changes"](./assets/partial-selected.png)

*The second change unticked: it dims, and the button says what approving will
actually do.*

Untick everything and the button becomes a refusal rather than a write of
nothing, which would otherwise report success for an edit that never happened.

A change confined to one spot has nothing to choose between, so it stays the
plain yes/no it always was.

### What actually gets written

Only the parts you kept. The parts you unticked stay exactly as they are on
disk — not reverted afterwards, but never written in the first place.

Claude is told what was applied, so it carries on from the file as it really is
rather than from what it proposed.

## Seeing it in your IDE's own diff viewer

If you run the plugin inside a JetBrains IDE, the same change also opens in the
IDE's diff viewer — the side-by-side window you already use for version control
— while the prompt waits for your answer. Approve or reject, and the tab closes
itself.

The approval buttons stay in the chat panel. That is deliberate: putting them in
the diff window too would mean walking back and forth between two places to
answer one question.

You can turn this off in **Settings → IDE → Show Claude's edits in the IDE diff
viewer**. With it off, nothing opens and the flow is exactly what it was before
this release. Running outside an IDE, the option is shown but inactive, since
there is no IDE window to open anything in.

## A new IDE section in settings

Two settings that only mean anything inside an IDE — *Attach the editor file by
default* and *Focus chat input after attaching file path* — used to sit under
General, where they were visible to people running in a browser who could never
use them. They have moved to the new **IDE** section, keeping their values.

![The IDE settings section with three toggles, the diff-viewer one greyed out](./assets/ide-settings.png)

*Running outside an IDE: the two carried-over settings still work, and only the
new diff option is inactive, with a line saying why.*

Related: [#109](https://github.com/Swttch/swttch/issues/109),
[#41](https://github.com/Swttch/swttch/issues/41)
