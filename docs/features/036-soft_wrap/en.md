# Long lines fold so you can read them at a glance

> Language: **English** · [한국어](./ko.md)
>
> Related: [#179](https://github.com/Swttch/swttch/issues/179)

Some blocks in the transcript are drawn in a monospace font: the diff card that
appears when a file is edited, the `IN`/`OUT` rows of a tool call, the card that
records a question and your answer.

Until now those blocks never folded a line. A long line was cut off at the edge
of the card, and reaching the rest meant scrolling sideways. For content that is
long by nature — a line of JSON, a full path — all you saw was the beginning.

In a diff this hurts most. The removed line and the added line sit one above the
other, and **when the part that actually changed is past the cut**, there is no
way to tell what changed.

![Soft wrap off — a long line is cut off at the right edge of the card](./assets/wrap-off.png)

*The default, with soft wrap off. Long lines stop at the card's edge and the rest
is reachable only by scrolling sideways.*

## Turning soft wrap on

`Settings > Appearance` now has a **Soft Wrap** switch.

Turn it on and long lines fold to the width of the block. The whole line fits on
screen with no sideways scrolling. It applies the same way to diffs, tool output,
and recorded questions.

![The Soft Wrap switch in Settings > Appearance](./assets/setting.png)

*The Soft Wrap switch in `Settings > Appearance`. It takes effect immediately —
there is nothing to save.*

![Soft wrap on — the long line folds and the whole text is visible](./assets/wrap-on.png)

*With soft wrap on. The same long lines fold across several rows and the full
text is visible.*

It is off by default. Scrolling sideways is how these blocks have always behaved,
so wrapping is the change you opt into rather than the other way round.

Content with **long stretches and no spaces**, like a path or JSON, would still
spill out if it only broke at word boundaries. So it breaks mid-token when it has
to.

## The row colour now runs to the end of the text

In a diff, removed lines are tinted red and added lines green. But scrolling
sideways used to leave that tint behind: the text carried on while the colour
stopped partway, so you could no longer tell whether you were looking at a
removed line or an added one.

Now the colour follows the text however far you scroll.

This applies **regardless of the soft wrap setting**. With wrapping on there is
nothing to scroll to and the problem cannot arise — but since the switch is off
by default, the colour has to be right with it off too.

## A tidier Appearance screen

The first box on the `Appearance` screen used to carry a "Theme" heading.

When the screen is already called "Appearance", a "Theme" heading directly below
it spends a line without drawing a distinction. That colour theme, font size, and
line spacing belong together is already clear from the box holding them. So the
heading is gone.
