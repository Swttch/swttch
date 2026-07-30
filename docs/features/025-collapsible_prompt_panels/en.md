# Tuck away the panel that's asking you something — and click "Esc to cancel" to actually cancel

> Language: **English** · [한국어](./ko.md)

While Claude works, there are moments when it turns around and asks you something. "Run this command?" "Go ahead with this plan?" "Which of these two do you want?" When that happens, a panel of choices slides up above the chat input.

This update changes two things about living with those panels. You can now **tuck them away for a moment**, and you can **click the "Esc to cancel" line** at the bottom instead of reaching for the key.

## What was wrong

The moment a panel appears is usually the moment you need to **read something before you can decide**. Why does Claude want to run that command? What did it check first? You need to see that before "Yes" or "No" means anything.

But the panel takes up a good chunk of the lower screen. On a desktop that's tolerable. **On a narrow screen — a phone — the very thing you need to read gets squeezed into the sliver above the panel.** You end up scrolling up and down to piece together the reasoning, and it's easy to lose track of what you were being asked in the first place.

![A permission panel sitting above an answer, taking up the lower half of the screen so the text behind it is cut off](./assets/panel-expanded.png)

*A permission panel over an eight-point answer. The panel owns the bottom half of the screen, so the explanation you actually need is cut off somewhere around point 4.*

## Collapse it, like minimizing a window

There's now a **collapse button** (⌄) in the panel's top-right corner. Press it and the panel shrinks to a single line, getting out of your way.

![After collapsing — all eight points and the tool card are visible, with just a one-line bar at the bottom](./assets/panel-collapsed.png)

*The same screen with the panel collapsed. Points 1 through 8 are all visible, and the tool card below them has come into view. At the bottom, a single line remains: "Run this command?"*

Think of it the way you think of minimizing a window.

- **Collapsing is not answering, and not cancelling.** Claude is still waiting, and its work is still paused exactly where it was.
- **You still see what's pending.** The collapsed bar keeps the panel's title — "Run this command?" and the like — so you don't forget what's waiting on you.
- **Bringing it back is one press.** Use the expand button (⌃) on the right of the bar, or **click anywhere on the bar**. Whatever you had selected or typed is still there.
- **Number keys are off while collapsed.** When the panel is open you can pick an option with `1`, `2`, `3`. While it's collapsed those keys do nothing — you're reading the conversation behind it, and a stray digit must never turn into an approval. **`Esc` still cancels, collapsed or not.**
- **The next question always arrives open.** Collapsing applies to that one panel. Once you answer or cancel it, the collapsed state goes with it, and the next question always shows up expanded. You can't leave something collapsed and then miss a new request.

## Clicking "Esc to cancel"

There has always been an **"Esc to cancel"** hint at the bottom of these panels. Until now it was only a hint — to actually cancel, you had to press the `Esc` key.

If you don't have a keyboard handy, or reaching for it is awkward — connecting from a phone or tablet is the usual case — the hint was telling you about an option you couldn't take.

Now **clicking that text does exactly what pressing `Esc` does.** Hover it and the text underlines and the cursor turns into a pointer, so it's clear it can be clicked.

We deliberately didn't turn it into a button. Another prominent button among the option buttons would only muddy the choice, so it stays the same quiet line it always was — just clickable. The `Esc` key works exactly as before.

## Which panels this covers

All three of the panels Claude uses to ask you something.

| Panel | When it appears |
|-------|-----------------|
| Tool permission | Before running a command or changing a file, asking your approval |
| Plan approval | In plan mode, asking whether to proceed with the plan |
| Question with options | When Claude asks you to choose between options directly |

All three get the same collapse button in the top-right corner and the same clickable "Esc to cancel" at the bottom. For a panel with several questions, the collapsed bar shows the name of the question you were on.

## Notes

- The collapse button is reachable with `Tab` as well as the mouse, and screen readers announce it as "Collapse" / "Expand".
- This is available in all 12 interface languages.
