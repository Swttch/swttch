# A pinned instruction folds away as you scroll

> Language: **English** · [한국어](./ko.md)

## What was wrong

Your instruction now stays pinned to the top of the screen. But **send a long
one and that pinned instruction covers most of the view.**

You scrolled down to read the reply it produced, and half the screen is taken
up by what you wrote a minute ago. Keeping the instruction visible had started
hiding the answer.

## What we did

A pinned instruction now **folds as you scroll.**

Every pixel you scroll takes a pixel off its height, down to a single line.
Scroll back up and it unfolds by exactly as much as you came back.

Its bottom edge tracks where the message would have been, so it reads as
**sinking under the top edge** rather than as a box resizing itself. Reaching
its full height again is the same moment the instruction arrives back at its
own place, so unfolding and unpinning line up on their own.

Once it is down to a line it stays there until the next instruction takes over
the spot. However long the reply, what you asked for is still readable in that
one line.

### A folded instruction looks different from a short one

Stopping at exactly one line makes a folded instruction **indistinguishable
from one that was only ever a line long.** Nothing on screen tells you whether
there is more underneath.

So the fold stops a few pixels above one line. The second line is clipped
mid-height and shows as a sliver, which reads as "there is more here".

A genuinely one-line instruction is not padded up to that. The drawn height is
capped at the instruction's own height, so a short one stays short. **The
difference between the two is the signal.**

### You can still open it in full

Click the body and the whole instruction opens, however far it had folded.

Opened, it grows to at most 80% of the screen and scrolls inside itself beyond
that. A pinned instruction is fixed to the screen, so **scrolling the page
cannot move through it** — this is the only way to read a long one end to end.
The 80% cap keeps an opened instruction from burying the reply entirely.

Click again and it returns to the height the **current** scroll position calls
for, not the one it had when you opened it. The fold kept counting the whole
time it was open.

## What we learned building it

### The fold was measuring what the fold had just moved

The first version shuddered along the bottom edge of the instruction.

The height came from how far a marker had travelled up the screen — but
folding moves that marker. A shorter box lifts the content below it, the
document gets shorter, the browser nudges the scroll position, and the marker
lands somewhere new. The next frame measures that new position and produces a
different height.

**The fold was eating its own output.**

It now reads one number: the scroll position. That is the only value in the
chain the fold cannot disturb. It is taken once as the instruction pins, and
every reading after it is a plain difference. No layout is measured at all.

### A pinned element still occupies its place

Underneath the shudder was a wrong assumption. A pinned element floats above
the page, so folding it should leave everything below alone — **it does not.**

Pinning changes only where something is drawn, not the room it takes up in the
document. Measured on a real conversation: folding the box by 249px shortened
the document by exactly 249. Scroll 4px, fold 4px, the content below rises 4px,
and **the screen moves 8.**

So the height the fold gives up is added back elsewhere. The first attempt put
that space **inside** the pinned element — and then the empty part was pinned
to the screen too: a 177px band of blank surface under the folded instruction,
which is precisely the space this feature exists to reclaim.

Moving it **outside** the pinned element fixed both. The pinned part hugs the
folded instruction while the document keeps its length.

### Measuring a folded height folds it twice

The fold counts down from the instruction's real height. Read that straight off
the box, though, and **a previous fold's height may still be sitting on it** —
so the fold starts from an already-folded number and folds again. Measure,
fold, measure, fold.

This never showed on long instructions: they hit the maximum-height cap, so any
measurement returned the same value. **Only one-line instructions flickered.**

The fold is now lifted off first and the natural height read underneath it, in
one pass before anything is drawn.

### There was a floor but no ceiling

Around the same time a one-line instruction was being drawn as a **448px empty
box.**

Scrolling back past the starting point drives the computed height above where
the instruction began. The fold had a floor — never shorter than a line — but
no ceiling saying it could never be taller than it started. Long instructions
hid this too, since the maximum-height cap caught it for them.

The computed value still runs past both bounds on purpose. Fold 500px past the
bottom, nudge back 10, and it must stay shut: unfolding has to retrace the same
distance, and only an unclamped number remembers how far it went. **The
clamping happens at the moment of drawing, nowhere else.**

### Where to put a calculation that runs every frame

The fold is continuous, so it recomputes every frame while scrolling. In a view
that holds thousands of entries, one watcher per instruction is a cost this
list will not carry.

There is a single watcher on the scroll container instead, and only the
**one** currently pinned instruction computes anything — there is never more
than one. Readings are collapsed to one per frame, so a trackpad flooding the
page with scroll events still produces a single calculation.

The computed height reaches the instruction without being passed down through
the component in between. That component is memoised, and threading a
per-frame value through it would re-render **every kind of message it can
draw, every frame**, for a number only one of them reads.
