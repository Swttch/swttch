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

Every message you send now carries a small **⋮ button straddling its top-right
corner.** Hover the message and it appears; click it and a menu opens.

The menu's item is **"Collapse reply up to the next message."** Choose it and
everything Claude produced in answer to that message folds away, up to the
point where your next message begins. Your own message stays exactly where it
was.

Fold a few of them and the session becomes **a list of what you asked**, which
is the thing you were scrolling to find.

### Nothing disappears without saying so

A folded reply leaves a line in its place: **"Reply hidden."**

That line is deliberate. A section with nothing in it looks the same as a
session that failed to load, and you have to be able to tell "I hid this" from
"this is broken."

It says that and nothing more — **no count of what is hidden.** The first
version did give one and it was wrong: see below.

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

The button sits on the top-right corner of your message — half on the bubble,
half off it — and it is a menu rather than a plain toggle.

Both of those come from the Claude Code extension in Cursor, which puts its
per-message actions in exactly that spot. Someone arriving from Cursor should
find these where they already reach for them.

Riding the corner is also what keeps the button small. Standing beside the
message, it would need room of its own and would push the text in; sitting on
the corner it needs none, so it can be **small enough to stay out of the way**
and still be where you look for it.

The glyph is not borrowed. Cursor draws a back-arrow, which reads as "undo" —
right for a menu of fork and rewind, wrong for one whose entry folds a reply
away. **⋮ promises a menu and nothing more**, and it is already what the
session header uses for the same job, so the two menus look like the same kind
of thing.

The menu holds one item today. It is built as a list anyway, because
**per-message actions are a category, not a single feature** — forking a
conversation from a message and rewinding code to it are the ones Cursor
already offers, and they belong in this menu when they arrive rather than in a
control redesigned around them.

## What we learned building it

### Counting the entries is not counting the messages

The notice first read "N hidden messages", and the number was wrong in two
different ways at once. A reply showing **four** bubbles reported **2** while it
was streaming, and **11** after the page was reloaded.

The count came from the number of transcript entries in the folded section. But
**an entry is not a bubble.** Plenty of them draw nothing at all: on the session
where this was caught, one section held 11 entries and drew 4, the other 7 being
attachments, which the renderer has no case for and skips. Live streaming and a
transcript replayed from disk do not carry the same entries either, which is
where the second number came from.

The fix was not a better count. Counting the drawn bubbles is not possible at
that moment — the check for "does this draw anything?" runs *after* rendering,
by measuring what came out, so the number does not exist until the very thing
being hidden has been rendered. Reproducing the rules some other way would mean
re-implementing a decision that already leaked three times when it was made
rule-by-rule.

So the notice stopped counting. **A number that is confidently wrong is worse
than no number**, and what the reader actually needs from that line is "a reply
is here and you hid it".

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
