# Every model in the list is reachable, however many there are

> Language: **English** · [한국어](./ko.md)
>
> Related: [#314](https://github.com/Swttch/swttch/issues/314)

## The report

A user wrote in:

> When there are more than 16 selectable models, the extra ones are not visible
> and cannot be scrolled to select. The PC is a MacBook Pro M4.

And asked for:

> Supports scrolling within the interface.

## What was wrong

Clicking the model name below the composer opens the model picker. That panel
grows **upward** from the composer.

The panel had **no height limit.** With four or five models that is fine, but a
catalog of sixteen or more — the kind you get when you connect your own models —
kept growing straight past the top of the window.

Whatever went past the edge had nowhere to be drawn, so it was not visible. And
because the panel had no scrolling either, **there was no way to reach those
models at all.** They were in the list, and they could not be picked.

## How it was fixed

The panel now has a height limit, and the rows **scroll** inside it.

However many models there are, the panel stays within the window. You can scroll
down to the last one — and click it.

### A short window gets a shorter panel

Pinning the limit to one fixed number leaves it too large for anyone working in a
short window: the panel slides under the top bar and hides its own header.

So the limit is set from **the room actually left above the composer.** A tall
window opens the panel to its full size, a short one shrinks it, and the list
keeps scrolling either way. Resize the window and it is measured again.

### The header does not scroll away with the rows

The top of the panel carries a "Select a model" label and the keyboard shortcut.

Putting the scroll on the whole panel would carry that header up and out of sight
as you scroll. Instead the **header stays put and only the rows move.** Wherever
you are in the list, you can still see what you are choosing.

### The model you are on is visible even when it sits near the bottom

A long list creates a new problem. If the model you are currently running is far
down the list, opening the picker shows you the top of the list and **not which
model is actually on** — the check mark is off-screen.

So opening the picker now scrolls straight to the current model. The check mark
is there as soon as the panel appears.

## What we learned building it

### The panel next door already had the answer

There is another panel that opens in the same spot: the slash command panel.

Put the two side by side and they were **nearly identical, character for
character.** Same positioning, same shadow, same border, same padding — with
exactly two lines, the height limit and the scroll, missing from the model side.

So rather than inventing a number, the fix reuses the one the slash panel already
used (320 pixels). Two panels that open in the same place at the same size read
better anyway.

### A height limit alone does not make the list shrink

Capping the panel and giving the rows a scrollbar was not enough on its own. The
list still pushed past the cap.

In a vertical stack, each section **refuses by default to be smaller than its own
contents.** The list argues that it holds twenty models and must therefore be
that tall, and the cap loses that argument. Only after explicitly allowing it to
shrink does it fit inside the cap and start scrolling.

### What we saw and what the code said did not match

Checking the fix in a small window, the panel's header turned out to be hidden
behind the top banner.

The obvious reading was that the panel had escaped past the top of the window.
Measuring it said otherwise: the panel was sitting comfortably inside. The banner
was simply being **drawn on top of it.**

That holds even though the panel's z-index is far higher than the banner's. Those
numbers are only compared within the same layer, so once two elements land in
different layers, the larger number buys nothing.

This is a separate problem from the one reported here, and it happened with long
lists before this change too. **It was left alone in this fix.**

### The test had to be checked before its result was

The first version of the test for "does it scroll" read the style the browser had
computed. It passed.

But this project's test environment **leaves most stylesheets empty for speed.**
So the computed style was equally blank with the fix and without it. The test was
not passing — it was **measuring nothing.**

That only surfaced after deliberately reverting the fix to see whether the test
would fail. It now checks the value attached in the code instead, and reverting
the fix fails it exactly as it should.
