# The chat now uses your IDE theme's own colors

> Language: **English** · [한국어](./ko.md)
>
> Related: [#267](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/267)

## The report

A user pointed out that the chat's background color did not match their IDE theme, and suggested
that following the applied theme's background would make the whole window read as one surface.

They were right. In dark mode the chat painted `#1A1A1A`, while IntelliJ Dark's editor background
is `#1E1F22`. The two are close but not equal, so the color visibly stepped wherever the chat met
the IDE around it.

## Why this was not already matched

Matching the color means knowing which theme is currently applied — and JetBrains themes **cannot
be counted.** Some ship with the IDE, some come from the marketplace, and users can hand-write
their own `.theme.json`.

So "look up the theme by name and map it to a palette" was never viable. Every new theme would
need a plugin change, and a theme a user wrote yesterday could never be supported at all.

## How it was solved

**By never asking for the theme's name.**

The plugin does not know which theme is applied. It asks the IDE "what color is the editor
background right now?" and takes that value as-is. When the theme changes, it asks again.

This works identically for bundled themes, marketplace themes, and a theme the user just wrote,
because there is no code anywhere in the plugin that knows a theme name.

Backgrounds are not the only thing collected. Text color, borders, the accent color, input
backgrounds and tooltip colors come along too. If a theme leaves any of those undefined, only
that entry falls back to the plugin's own color.

## How to use it

A **"Sync with IDE"** checkbox now sits to the right of **Settings → Appearance → Color Theme**.

The checkbox is **off by default.** Until you turn it on, everything looks exactly as before with
the plugin's own theme. Turn it on only when you want the colors to follow your IDE.

With it on, the Color Theme dropdown is replaced by a **"Managed by IDE"** marker — the IDE decides
the colors at that point, so picking from the dropdown would mean nothing. Turn the checkbox back
off and the dropdown returns along with the original colors.

Changing your IDE theme updates the chat **immediately.** No IDE restart is needed.

## A few things worth knowing

**The checkbox only appears inside the IDE.** When you connect from a browser there is no IDE theme
to match, so the checkbox is not shown. The same applies when a browser connects to a backend the
IDE started — there is no route yet to deliver the colors to a browser.

**The theme name is not displayed.** The marker reads "Managed by IDE" rather than naming the actual
theme (say, Dracula) for a reason: reading the theme name in JetBrains requires an API still marked
experimental, and using it raises a warning in the marketplace release check. Showing one label is
not worth putting a release at risk.

**The hover highlight does not use the IDE's value directly.** The highlight color the IDE reports
is nearly white even on dark themes, so painting it as-is makes a single row flash white. Instead it
is derived from the IDE's panel color by shifting brightness a fixed amount — lighter on dark themes,
darker on light ones — so the step stays visible whatever theme is applied.
