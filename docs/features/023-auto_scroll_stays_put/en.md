# The view stays where you put it while you read

> Language: **English** · [한국어](./ko.md)
>
> Related: [#206](https://github.com/Swttch/swttch/issues/206)

## The report

A user told us, briefly:

> If the conversation is running, the window scrolls up and down.

The chat would not hold still while an answer was streaming in. No reproduction steps
came with the report, so it was hard to pin down at first — but following the code
turned up two separate defects that surface as the same symptom.

## What was actually happening

### First, every tool call dragged the view back to the bottom

The chat re-engages following whenever you send a new message. That is the right call:
if you scrolled up to read something but then typed a message yourself, you want to see
the reply.

The trouble was how "a message you sent" was recognised. Claude Code records the
conversation one entry at a time, and **it records tool results as the same kind of
entry as your own messages.** That grouping reflects the shape of the exchange, not who
wrote it.

So every file read and every command run looked like "the user just sent something new".
Each one switched following back on and pulled the view down to the bottom.

Counting across 40 real conversations (26,941 entries): the user actually sent something
384 times, while the view was dragged down **5,031 times**. Roughly 92% of that was
unwanted. It got worse the more files were read and the more commands were run in a row,
which is why it stood out during long runs.

### Second, auto-scroll switched off with nothing to show for it

Settings has an **auto-scroll resume distance**. Stay within that distance of the bottom
and the view keeps following; move past it and the view stops so you can read in peace.

That setting only governed **resuming**, though. The decision to **stop** was held by a
separate 2-pixel rule that had nothing to do with the setting.

Two different boundaries left a gap between them. Nudge up slightly and following had
already stopped — but the "Scroll to bottom" button only appears once you are past the
configured distance, so it was still hidden. That button is how you are told auto-scroll
is off, so the view went quietly unfollowed with nothing on screen explaining why. At the
default of 80, that covered every distance from 0 to 80 pixels.

## What changed

**Tool results no longer count as new messages.** Only what you actually entered counts —
typed text, and images you pasted. Entries Claude Code writes on its own, such as tool
results and the carried-over compact summary, are excluded. The view now returns to the
bottom exactly as often as you actually sent something.

**The configured distance is now the only boundary.** The hidden 2-pixel rule is gone.

- **Within** the configured distance, the view keeps following. Nudge up and it settles
  back to the bottom.
- **Past** it, following stops and the "Scroll to bottom" button appears at the same moment.

Auto-scroll being off and the button being visible are now the same thing. There is no
longer a range where the view stops following without telling you.

Raise the setting to 200 and you get 200 pixels of "keeps following"; lower it to 30 and
you get 30. The value you set is the boundary.

## Also tidied up

The setting's description still described the old behaviour — it said scrolling up
"always" pauses auto-scroll, when it now pauses only past the configured distance. The
wording was corrected in all 12 supported languages.

## What did not change

When a long answer arrives all at once, the content grows and the bottom moves away
without you having done anything. In that case the view **keeps following**. Only you
scrolling up stops it. That behaviour was already in place and is unchanged.
