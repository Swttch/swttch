# Find a slash command by the first letters of its words

> Language: **English** · [한국어](./ko.md)

Type only the first letter of each word of a command name and the command list finds it. `/gwd` finds `/grill-with-docs`.

## What it does

A command name is split into words at `-`, `:` and `_`. The first letters of those words are the command's initials. `/grill-with-docs` has the initials `gwd`, and `/oh-my-claudecode:analyze` has `omca`.

- `/gwd` lists `/grill-with-docs`. `/gw`, the start of the initials, lists it too. Capital letters work the same.
- The matching letters in the name are shown in bold.
- A name of one word (`/model`) has no initials. A single typed letter is never read as initials.

## Order in the list

Commands whose name contains what you typed always come first, as before. Commands matched only by their initials come after them, those whose whole initials equal what you typed first. Matches by keyword and description come last. Nothing that was listed before moves.

If several commands share the initials, all of them are listed and you pick one. Nothing is chosen for you.

## With arguments

`/gwd some text` is read as `/grill-with-docs some text` when exactly one command has the initials `gwd` and no command is named `/gwd`. Picking it or pressing Enter sends the full name and the arguments to Claude Code. Claude Code never receives `/gwd`.

When two commands share the initials, the line is left as typed.

## Not covered

This only changes the slash command list. `@` file references and `!!` prompt search are unchanged.
