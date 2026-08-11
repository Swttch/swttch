# Empty bubbles are gone, and sentences containing `$` stay intact

> Language: **English** · [한국어](./ko.md)
>
> Related: [#232](https://github.com/Swttch/swttch/issues/232)

## The report

A user told us that **empty message bubbles** were appearing in the middle of
their conversation — a small chip with a border and a background and nothing
inside. Sometimes a whole column of them ran down the screen.

They also pointed at the cause. The assistant's side of the chat already refuses
to draw a message with no content; the user's side never did. They were right.

## What was actually happening

The box that draws a message bubble **paints its border and background before
knowing whether anything will go inside.** So when a message with nothing to
display arrived, what remained on screen was its own padding: a bare chip
**18px wide and 9px tall**.

Messages like that are not a malfunction — they are ordinary traffic.

- A message carrying only Claude Code's internal note (`<system-reminder>`).
  Strip the note and no words are left.
- A message carrying only the name of a file you have open. That goes out
  separately as a file chip below, leaving the body empty.
- A message that simply arrives with no content at all.

## What changed

**A bubble with nothing to show is no longer drawn.** If there is text, an image,
or a file chip, it appears exactly as before; only when all of them are missing
does it step aside. That matches what the assistant's side has always done, so
both now follow the same rule.

One case is deliberately kept. **A tool's result stays visible even when its body
is empty.** Such a message looks empty not because it has no content, but because
it is folded into the tool card just above it — and when that card belongs to an
earlier part of the conversation that has not been loaded yet, there is nothing
to fold into. Dropping it then would make the tool's output disappear without a
trace. So the test is not "is the text empty" but **"is there genuinely nothing
to show"**.

## Also fixed (1): sentences containing `$` came out mangled

Looking into the empty bubbles turned up something worse.

Two `$` signs in one sentence were read as **a mathematical formula** between
them. Ordinary prose about a shell variable (`$VAR`) or a price qualified. The
dollars vanished, the span between them was re-rendered as math, and **the
surrounding sentence was printed several times over.**

Here is what it looked like:

```
Written : 看有没有 $VAR 会被当变量展开（值为空）。模板含 $NAME 它。
Shown   : 看有没有 VAR会被当变量展开（值为空）。模板含VAR 会被当变量展开（值为空）。模板含 VAR会被当变量展开（值为空）。模板含NAME 它。
```

A single `$` is **no longer treated as math**. It is far more often a shell
variable or a price than an equation, and misreading one breaks the sentence
itself. Deliberate math still works through `$$…$$` and `\(…\)`, so nothing is
lost for anyone actually writing formulas.

## Also fixed (2): copied logs were missing the part that mattered

**"Copy plugin front log"** (search `copy` in the command panel) exists so you can
hand over a log when reporting a bug. It kept the last 5,000 lines — which sounds
generous, but a line is written per token while a reply streams, so in practice it
held about **80 seconds**.

This report showed exactly that. The reporter copied the log precisely as asked,
and the file stopped right at the limit with the relevant part already pushed out
of it. Half of what remained was the warning storm from the `$` problem above.

The log is now bounded by **32 MB** rather than by a line count — hours of
ordinary use. Logs sent from now on will include the moment things went wrong.

## What is different now

- **Empty bubbles no longer appear.**
- **Tool output is still there.** Removing empty bubbles does not take a tool's
  results with it.
- **Sentences with `$` read as written.** Talk about shell variables or prices
  without the text duplicating or the symbols disappearing.
- **Math still works.** `$$…$$` and `\(…\)` are unchanged.
- **A copied log now contains the cause**, which makes bug reports far more useful.

## What is still open

We could not confirm why more than twenty empty bubbles appeared in a row on the
reporter's screen — the record of that moment was lost to the truncation described
above. This fix **stops such bubbles from being drawn at all**, so the symptom is
resolved, but we still do not know why so many of those messages were exchanged.
Now that logs survive intact, we will be able to find out if it happens again.
