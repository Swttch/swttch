# Fold a reply away and scroll your session by its prompts

> Language: **English** · [한국어](./ko.md)

## What was wrong

A long session is hard to move around in.

You want to get back to something you asked half an hour ago. Between you and
it sit a dozen replies, each one a wall of tool calls and file output. **The
only way back is to scroll through all of it**, watching for the grey bubble
that says the thing you half-remember writing.

There was no way to put a reply out of the way once you were done with it.

## What we did

Every message you send now carries a **round button in its top-right corner.**
Hover the message and it appears; click it and a menu opens.

The menu's item is **"Collapse reply up to the next message."** Choose it and
everything Claude produced in answer to that message folds away, up to the
point where your next message begins. Your own message stays exactly where it
was.

Fold a few of them and the session becomes **a list of what you asked**, which
is the thing you were scrolling to find.

### Nothing disappears without saying so

A folded reply leaves a line in its place: **"14 hidden messages."**

That line is deliberate. A section with nothing in it looks the same as a
session that failed to load, and you have to be able to tell "I hid this" from
"this is broken." The count says the reply is still there and how much of it
there is.

The line is a button. Click it and the reply comes back, from the spot where
you noticed the gap. The menu on the message offers the same thing the other
way round, reading **"Expand reply"** while the section is folded.

### It lasts as long as you are looking at it

Folding is not saved. Reopen the session tomorrow and every reply is showing
again.

This is on purpose. What you fold is a reading aid for the session in front of
you right now — **something you hid months ago and have no memory of hiding
would just look like a reply that went missing.**

## Where the button is, and why there

The button sits in the top-right corner of your message, and it is a menu
rather than a plain toggle.

Both of those come from the Claude Code extension in Cursor, which puts its
per-message actions in exactly that spot. Someone arriving from Cursor should
find these where they already reach for them.

The menu holds one item today. It is built as a list anyway, because
**per-message actions are a category, not a single feature** — forking a
conversation from a message and rewinding code to it are the ones Cursor
already offers, and they belong in this menu when they arrive rather than in a
control redesigned around them.

## What we learned building it

### The grouping this needed already existed

"Everything from one message to the next" sounds like something that has to be
computed. It did not: the transcript was already **split into exactly those
groups**, by the work that made a message stay pinned to the top of the screen
while its reply scrolls past.

Each group is one message plus the reply it produced. Folding a reply is
dropping the second half of a group that was already drawn as a unit, which is
why the change adds no logic for deciding where a reply starts or ends.

### A folded reply is removed, not hidden

The obvious way to fold something is to leave it in the page and hide it with
CSS. That would have been the wrong choice here.

Replies carry tool cards and diff surfaces that keep observers running and
layout measured. Hidden with CSS they would **all stay alive, measuring
nothing**, in a session long enough that the cost is the reason you wanted to
fold in the first place. So a folded reply leaves the page entirely and is
rebuilt when it comes back.

### What identifies a section has to survive paging

Which sections are folded is remembered by the message that heads each one,
identified by its own id.

Anything positional would have been wrong. Loading an older page inserts
messages **in front of everything already on screen**, so a remembered position
would afterwards point at a different message and fold a reply nobody asked to
fold. Identity is what makes "load older messages" a non-event here.

### The menu had to stop clicks reaching what is underneath

Two things already act on a click in this area: the message body opens itself
to full height, and the message logs its underlying entry to the console for
diagnosing bug reports.

A menu drawn on top of both inherits both. Every click inside the menu is
stopped where it lands, and the outside-click that closes the menu listens for
the press rather than the full click — waiting for the click would let the
message body toggle open on the way out.
