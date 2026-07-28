# @ file mentions now work inside slash commands

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#236](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/236)

## The report

A user typed `/opsx:apply @skill` into the composer, expecting the file picker to
appear after the `@` — and nothing happened. They filed [#236](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/236)
with a screenshot of the slash command panel sitting there, no file list in
sight.

Two minutes later they added a second comment, and it turned out to be the clue
that cracked the whole thing:

> But.. when I pressed "setup" to find the link to this github.. and returned..
> I found this.. So it's an event/timing issue by the looks of things

Attached was a screenshot of the very same input — `/opsx:apply @skill` — except
now the file list *was* there, showing `dod/SKILL.md`, `diff-org-changes/SKILL.md`,
and the rest. Same text, different outcome. They guessed it was a timing problem.

It wasn't timing. It was worse, and simpler: the list had been ready the whole
time, sitting behind another panel.

## What was actually happening

The slash command panel and the `@` file picker are drawn in the **same spot** —
the strip directly above the composer. Only one of them can be there at a time,
so the code had a rule for who wins. That rule was: if the slash panel is open,
the mention dropdown does not render. Full stop.

Meanwhile, the slash panel decided whether to be open by asking a single
question: **"does this line start with `/`?"**

Put those together and you get the bug. `/opsx:apply @skill` starts with a `/`,
so the slash panel stayed open — not just while you typed the command name, but
for the entire line, forever after. And because it was open, the file picker was
never allowed on screen. The search had run. The results had arrived. They were
simply never drawn.

That also explains the "fix" the reporter stumbled into. Clicking outside the
composer is the one thing that closes the slash panel, so the moment they went
hunting for the GitHub link, the panel dismissed itself and the file list —
already loaded, still waiting — finally became visible.

There's a cruel detail here too: clicking away didn't really fix anything,
because the panel reopened on the very next keystroke. The reporter had found a
workaround that lasted exactly one character.

## What changed

The rule is no longer "does the line start with a slash". It's now **"where is
your cursor?"**

- If the cursor sits inside an `@token`, you're picking a file. The file picker
  takes the strip, and the slash panel steps aside.
- Anywhere else, you're still working on the command. The slash panel keeps the
  strip, exactly as before.

That single change makes the two features share the space instead of fighting
over it, and it means `@` mentions work after *any* slash command.

## What you'll see

- **Type `@` after a slash command and the file list appears.** `/review @s`,
  `/opsx:apply @skill`, your own custom skills — all of them. No clicking away,
  no waiting.
- **Pick a file and the command panel comes back.** Choose an entry and the path
  is inserted as a chip; because the mention is settled, the slash panel returns
  on its own. Previously it stayed hidden until you typed another character —
  a smaller version of the same bug, fixed in the same pass.
- **Move the cursor back into the token and the picker returns.** Backspace into
  `@src/` and you're browsing files again; type past it and you're back to the
  command. The two swap cleanly in both directions.
- **Email addresses are still left alone.** `fred@example.com` doesn't open a
  file picker, same as always — an `@` only counts when it starts a line or
  follows a space.
- **The two panels never stack.** Whatever you're doing, exactly one of them is
  on screen.

## A note on the issue title

The report was filed as "@ file mention does not work in the context of a skill",
and that's a fair description of what the reporter hit — they were using a skill
at the time. But skills were never the trigger. The condition was simply "a
slash command panel is open", which is true for `/review` and every other
built-in command just as much as for a custom skill. So the fix isn't
skill-specific: `@` mentions now work after anything you can type with a leading
slash.
