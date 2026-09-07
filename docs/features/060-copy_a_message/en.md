# Copy a message you sent

> Language: **English** · [한국어](./ko.md)

## What was wrong

There was no working way to copy your own message.

The prompt you typed is the one thing in a session you are most likely to want
back. You want to send it again with one word changed, paste it into an issue,
or carry it to another conversation. None of that was possible without
selecting the text by hand, and inside the IDE's WebView, dragging a selection
across a multi-line prompt is fiddly enough that people gave up and retyped.

A copy button did exist. It had been commented out of the code for an ordinary
text message, so it never appeared.

## What we did

Every message you send now offers **Copy message** in the **⋮ menu** on its
top-right corner, above the entry that collapses the reply.

Click it and the message text goes to the clipboard, and a small notice says
**"Message copied."** The menu closes on the click, which is why the
confirmation is a notice rather than a checkmark on the entry you can no longer
see.

The entry is always there. Rewinding is drawn only for a message the code can
actually be restored to, but copying needs nothing of the sort: every message
has text on screen, so there is no message where this is offered and does not
work.

### Where the button went

We did not bring the hover button back beside the bubble.

The ⋮ menu is the place this message's actions already live. Forking the
conversation from a message, rewinding the code to it, collapsing its reply:
they are all there, and copying is one more of the same kind. Two controls in
two places doing one job is harder to learn than one control in the place you
already look.

### A slash command copies as `/clear`, not as nothing

This is the part that was quietly broken.

Type `/clear` or `/compact` and it stays in the conversation as a message
bubble like any other. The copy button was still live on those, and it copied
**the empty string**. The bubble read `/clear`, you clicked copy, and your
clipboard held nothing.

The reason is that Claude Code writes a slash command to the transcript as
three tags and nothing else, so the plain text left after the tags are stripped
is empty. Checked against every slash command in the local session files: all
45 of them have that shape.

A bubble is a bubble. What you see is what gets copied, whichever kind of
message produced it.

## What we learned building it

### The broken control was the one still switched on

Going in, the commented-out button looked like the problem and the live one
looked fine. It was the other way round. The button nobody could reach would
have copied the right text; the button you could reach copied nothing at all.

It is a reminder that a control being present is not evidence that it works,
and that the quickest way to find out is to ask what value it actually passes
along rather than reading the label above it.

### "What does the bubble say" is the right question, not "what does the parser return"

The value the old button copied came straight from the text parser, which is
built to strip the CLI's bookkeeping tags out of a message. That is the correct
thing to show inside the bubble, where the command name is drawn separately in
its own dimmed style. It is the wrong thing to copy, because copying has to
reproduce what the reader is looking at, and the reader is looking at both
pieces.

So the assembly rule now lives in one function that the copy entry is built
from, right beside the code that draws the two pieces.

### Deleting the old control removed more than the control

With both kinds of message on the menu, the hover button had no callers left,
and neither did the clipboard hook it was the only user of, nor two translation
strings in twelve languages. Leaving a commented-out control next to a menu
that does the same job is what made this area confusing to read in the first
place.
