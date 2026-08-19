# No more scrolling back to see what you asked for

> Language: **English** · [한국어](./ko.md)
>
> Related: [#274](https://github.com/Swttch/swttch/issues/274)

## The report

A user wrote in:

> When kicking off a long process for the llm, I find myself scrolling through
> long thinking commentary to find out where my last instruction was, so I can
> review the steps/thinking that claude took.

And suggested a fix:

> Is it worth subtly highlighting the last human instruction.. perhaps with a
> low-intensity orange in the same family as claude orange.

## What was wrong

Give Claude one task and a long run of tool calls and thinking follows. Files
get read, commands get run, results get summarised — and the view keeps
flowing downward the whole time.

Somewhere in there, **the instruction that started all of it scrolls off the
screen.** Checking whether the work in front of you still matches what you
asked for meant scrolling a long way up to find the instruction, then back
down again.

## What we did

The instruction now **stays pinned to the top of the screen.**

A message you send stays at the top for as long as its reply is on screen. You
can scroll down through the tool calls and still see what you asked for.

Send the next message and the new instruction takes over the spot. The
previous one is pushed up and out as the new one arrives. Moving up and down
the conversation, it stays obvious which instruction the part you are reading
belongs to.

Since there is no longer anything to go looking for, **the suggested colour
highlight is not included.** Both approaches target the same problem — that
the instruction is hard to spot while scrolling past it — and pinning removes
that problem one step earlier. There is no reason to make something easier to
notice once it is always in view.

## What we learned building it

### Handing off instead of stacking meant changing the structure

Marking the messages "pin to top" sounds like the whole job, but doing only
that makes **the pinned messages stack on the same spot.** Each new one covers
the one before it, so the earlier instruction disappears entirely.

A pinned element cannot travel outside the area it belongs to. So each
instruction and the replies that follow it are now grouped into **one
section.** When that section scrolls off the top, the pin is dragged out with
it — and that is the moment the next section's instruction takes over.

Pushing out rather than covering up falls out of that.

### Tool results are recorded as "user messages" too

Claude Code appends the conversation one line at a time, and it **records tool
results under the same kind as the messages you send.** The distinction is a
formality of how the conversation is exchanged, not something meant for human
reading.

In a real conversation these outnumber genuine sends by roughly ten to one.
Pinning by kind alone would have stuck **a blank slot at the top of the screen**
on every single tool call, since nothing is drawn for those entries.

Fortunately the repository already knew the difference. A rule for telling
them apart was written for [#206](https://github.com/Swttch/swttch/issues/206),
where the same trap kept dragging the view to the bottom, so it is reused here
rather than written again.

### A gap made of six pixels

A thin sliver of scrolled content could be seen passing above the pinned
instruction.

The session header floats above the page, so the conversation area below
reserves blank space equal to the header's height. But the header sized itself
from its contents and came out at **34 pixels**, while the reserved space was
**40**. Those six pixels were the slot the scrolled content travelled through.

Pinning the header to the same height as the reserved space fixed it. The two
values are a pair — change one and the gap returns — so both sides of the code
now say so.
