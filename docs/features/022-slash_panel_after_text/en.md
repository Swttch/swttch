# Typing `/` mid-sentence opens the command panel

> Language: **English** · [한국어](./ko.md)
>
> Related: [#244](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/244)

## The report

A user sent us two observations side by side. One was "this works", the other
was "this differs".

> With nothing typed, pressing `/` brings up skills. Picking one sends it right
> away. That matches the VS Code extension.
>
> But after typing some content, pressing `/` no longer opens anything — there
> is no way to pick a skill by hand or reach Claude Code's own commands. That
> differs from the VS Code extension.

The first was a confirmation; the second was the bug. As it turned out, both
were two faces of the same code.

## What was actually happening

The command panel decided whether to open from a single test:
**"does the whole input start with `/`?"**

In an empty composer that test passes, so the panel opens. But with anything in
front — `explain this /` — it fails, and the panel stayed shut no matter how
many more characters were typed. Once a sentence had been started, there was no
way to pull up a skill or a CLI command at all.

The behaviour the reporter called correct comes from the same test. If the whole
input *is* the command, then the command is the entire message, so running and
sending it on pick is right. What was never decided is what should happen when
text precedes it — the panel never opened there, so the case never came up.

## What changed

The trigger now matches the one `@` file mentions use. The two share the same
slot above the composer, so it makes sense for them to open by the same rule.

- A `/` that **starts a line or follows a space**, with the **caret still inside
  that token**, opens the panel — regardless of what precedes it.
- A second `/` inside the token marks a path, so typing `src/utils` will not
  make the panel appear.

On top of that, what happens when you pick an item now depends on where you are.

- **Picked from an empty composer, it runs immediately**, exactly as before —
  the command is the whole message.
- **Picked after existing prose, it is completed into the text instead of run.**
  It is part of a sentence still being written; running it there would discard
  that prose and send a half-finished message.

## What's different

- **Typing `/` mid-sentence brings up the list.** Type `explain this /rev` and
  `/review` and friends are filtered in. Skills, CLI commands, and your own
  commands all qualify.
- **Your sentence survives.** Picking an item turns `explain this /rev` into
  `explain this /review `, with the caret parked just past the space so you can
  type arguments straight away.
- **Picking no longer sends.** Choosing a command mid-sentence is an act of
  writing, not of sending. Send it yourself when the message is ready.
- **The empty-composer behaviour is untouched.** `/model` on its own still runs
  the moment you pick it.
- **Paths are not mistaken for commands.** Neither `src/utils` nor
  `see src/utils` opens the panel.
- **No clash with `@` file mentions.** While the caret sits inside an `@token`
  the file list takes the slot and the command panel steps aside — the behaviour
  settled in [#236](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/236)
  still holds.

## Why the two reports were one

The reporter wrote up "picking sends immediately" and "the panel won't open" as
separate notes, but both fell out of the single "does the input start with `/`"
test. That test only ever considered the case where the command is the whole
message, so it blocked the mid-sentence case on the way in and left it undefined
on the way out. Moving to a caret-based rule settles both at once.
