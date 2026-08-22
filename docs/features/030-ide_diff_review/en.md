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

![The IDE's side-by-side diff window: tick boxes in the gutter beside the changed lines, and a bar underneath with the count, Apply and Reject. The chat prompt sits on the right](./assets/diff-review.png)

*The change is read in the diff, and what to keep is chosen there too. The
prompt on the right is exactly as it was.*

## Keep some of it, not all of it

When the change touches more than one place in the file, a tick box appears in
the gutter beside each one — right next to the lines it belongs to — with
**Apply** and **Reject** in a bar underneath.

Everything starts ticked, so pressing Apply without touching anything does what
approving always did: the whole edit. Unticking is how you narrow it, and
**1 of 2 selected** on the left of the bar says how much you are keeping.

Beside it, **Select all** / **Clear all** turns every box on or off at once, so
a change with many parts does not have to be ticked one at a time.

Narrow the diff and the bar drops its words for icons — a bar that pushes Apply
off the right edge leaves no way to answer at all.

Reject answers the same question the other way. Untick everything and Apply
turns itself off: keeping nothing is a rejection, and writing the file back
unchanged would report success for an edit that never happened.

A change confined to one spot has nothing to choose between, so it gets a plain
Apply and Reject.

## Closed the diff? Open it again

The diff can be closed while its question is still up — pressing Escape with the
diff focused does exactly that, leaving the prompt with no way to see what you
are approving.

So the **file name in the prompt is a link**. Click it and that edit's diff opens
again (or comes forward if it is already open, with your ticks intact). Looking
is not answering: the question stays, and the turn carries on.

Where an IDE diff cannot be shown — outside an IDE, or with the setting below
turned off — the name stays plain text, rather than underlining something that
would do nothing.

## Cancelling means "stop what you are doing"

Pressing Escape at the prompt, or clicking "Esc to cancel", now ends the turn as
well as refusing this request. Refusing alone left the turn running, so Claude
moved on to the next tool call and wrote up the refusal — your interruption came
back as an answer.

Choosing an option, or typing a reason and sending it, is a reply rather than an
interruption, so the conversation carries on as before.

### What actually gets written

Only the parts you kept. The parts you unticked stay exactly as they are on
disk — not reverted afterwards, but never written in the first place.

Claude is told what was applied, so it carries on from the file as it really is
rather than from what it proposed.

## Turning it off

**Settings → IDE → Show Claude's edits in the IDE diff viewer.** With it off, no
diff tab opens in the IDE.

> A later release changed what this setting means, from whether you see a diff
> to **where** you see one. Turning it off now shows the diff in the chat
> instead, so the change is never hidden either way. See
> [Fix the proposed code where you are reading it](../040-editable_diff_review/en.md).

Running outside an IDE, the option is shown but inactive, since there is no IDE
window to open anything in.

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
