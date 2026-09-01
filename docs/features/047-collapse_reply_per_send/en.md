# Collapse a reply and scroll your session by its prompts

> Language: **English** · [한국어](./ko.md)

## What was wrong

A long session is hard to move around in.

You want to get back to something you asked half an hour ago. Between you and
it sit a dozen replies, each one a wall of tool calls and file output. **The
only way back is to scroll through all of it**, watching for the grey bubble
that says the thing you half-remember writing.

There was no way to put a reply out of the way once you were done with it.

## What we did

Every message you send now carries a **fold arrow in the margin beside it** —
the same control your editor draws next to a line you can fold, in the same
place and with the same two states.

Click it and everything Claude produced in answer to that message collapses, up
to the point where your next message begins. Click it again and the reply comes
back. Your own message stays exactly where it was.

Collapse a few of them and the session becomes **a list of what you asked**,
which is the thing you were scrolling to find.

The arrow is always visible, unlike the other controls on a message, which
appear only when you hover. It has to be: a folded section must say so from
across the screen, and an arrow you have to hunt for by hovering costs the
reach-and-wait it exists to remove.

### It says how much it is hiding

A collapsed reply leaves a line in its place, reading **"4 replies
collapsed."**

The number is the count of messages in what was folded — the bullets running
down the left margin, which is what you would count if you looked.

That line is deliberate. A section with nothing in it looks the same as a
session that failed to load, and you have to be able to tell "I collapsed this"
from "this is broken."

It is drawn as **an inline note about the conversation**, the way "interrupted"
is: same size, same muted italic, aligned to the same edge as your messages. It
was a full-width banded strip at first, which cost more vertical space than the
message it belonged to and read as the same kind of thing as the "scroll to
bottom" button once both were on screen.

You can click the line to bring the reply back, from the spot where you noticed
the gap. It carries no arrow of its own, though — "4 replies collapsed" is a
statement, and a control that looks pressable should say what pressing it does.
The arrow in the margin is the advertised way to open a section again.

### The count keeps up with a reply still being written

You can fold a section while Claude is still answering it, and the number keeps
climbing as the reply grows behind the line.

That is worth saying because it is not free: it is the reason a folded reply is
hidden rather than thrown away. See below.

### It lasts as long as you are looking at it

Collapsing is not saved. Reopen the session tomorrow and every reply is showing
again.

This is on purpose. What you collapse is a reading aid for the session in
front of you right now — **a reply you collapsed months ago, with no memory of
having done it, would just look like a reply that went missing.**

## The two controls, and why there are two

Beside the arrow, every message also carries a **⋮ button straddling its
top-right corner.** Hover the message and it appears; its menu offers the same
"Collapse reply", and "Expand reply" while the section is folded.

The menu came first, and the person who asked for this feature counted its
steps: open the menu, cross the bubble to the item, click again. An arrow costs
a move and one click, which is what a fold should cost. So the arrow was added
and the menu kept.

They are not rivals. **Per-message actions are a category, not a single
feature** — forking a conversation from a message and rewinding code to it are
the ones Cursor already offers, and they belong in that menu when they arrive.
It would be odd for the one action already there to vanish from the list as the
others join it.

### Why the arrow costs no width

The arrow hangs outside your message by exactly the margin the transcript
already keeps at its edge, so it lands in space that was empty and **no message
moves.**

Taking a column was tried first — giving one up is what the reporter proposed,
and it is what an editor gutter costs — but seen on a real session the indent
was not worth what it bought. Hanging the control outside the bubble is the
same trick the ⋮ button uses on the opposite corner.

### Why the ⋮ button is where it is

The ⋮ sits half on the bubble and half off it, and it is a menu rather than a
plain toggle. Both come from the Claude Code extension in Cursor, which puts
its per-message actions in exactly that spot. Someone arriving from Cursor
should find these where they already reach for them.

Riding the corner is also what keeps it small. Standing beside the message it
would need room of its own and would push the text in.

The glyph is not borrowed. Cursor draws a back-arrow, which reads as "undo" —
right for a menu of fork and rewind, wrong for one whose entry collapses a
reply. **⋮ promises a menu and nothing more**, and it is already what the
session header uses for the same job.

## What we learned building it

### Counting the entries is not counting the messages

The line first read "N hidden messages", and the number was wrong in two
different ways at once. A reply showing **four** bubbles reported **2** while it
was streaming, and **11** after the page was reloaded.

The count came from the number of transcript entries in the collapsed section.
But **an entry is not a message you can see.** Plenty of them draw nothing at
all: on the session where this was caught, one section held 11 entries and drew
4, the other 7 being attachments, which the renderer skips. Live streaming and
a transcript replayed from disk do not carry the same entries either, which is
where the second number came from.

So the count was removed, on the grounds that **a number that is confidently
wrong is worse than no number.**

It is back now, and what changed is not the arithmetic but the question. The
number is no longer predicted from the entries; it is **measured off the page**,
by counting the bullets that lead each message in the folded section. Those
bullets are drawn in one place, so they can be counted without knowing anything
about which kinds of entry draw what — the same move the renderer already makes
when it decides whether a bubble is empty by measuring what it drew.

### A collapsed reply is hidden, not removed

The first version dropped the reply out of the page entirely and rebuilt it when
it came back. The reasoning was that replies carry tool cards and diff surfaces
that keep observers running and layout measured, and leaving them alive while
hidden would keep the cost you collapsed the section to avoid.

That was traded away for the count, deliberately.

**The measurement only exists while the reply is on the page.** Thrown out of
the page, there is nothing to count, and a number captured at the moment of
folding would go stale the instant Claude added another tool call to a section
you had already folded.

Hiding it with CSS keeps the cost that actually made scrolling expensive off
the table — a hidden subtree is not laid out and not painted. What stays is the
bookkeeping of keeping those components alive, and that is the price of a
number that is true a second after you fold.

### The grouping this needed already existed

"Everything from one message to the next" sounds like something that has to be
computed. It did not: the transcript was already **split into exactly those
groups**, by the work that made a message stay pinned to the top of the screen
while its reply scrolls past.

Each group is one message plus the reply it produced. Collapsing a reply is
hiding the second half of a group that was already drawn as a unit, which is
why the change adds no logic for deciding where a reply starts or ends.

### What identifies a section has to survive paging

Which sections are collapsed is remembered by the message that heads each one,
identified by its own id.

Anything positional would have been wrong. Loading an older page inserts
messages **in front of everything already on screen**, so a remembered position
would afterwards point at a different message and collapse a reply nobody asked
to collapse. Identity is what makes "load older messages" a non-event here.

### The controls had to stop clicks reaching what is underneath

Two things already act on a click in this area: the message body opens itself
to full height, and the message logs its underlying entry to the console for
diagnosing bug reports.

A control drawn on top of both inherits both. Every click on the arrow and
inside the menu is stopped where it lands, and the outside-click that closes the
menu listens for the press rather than the full click — waiting for the click
would let the message body toggle open on the way out.
