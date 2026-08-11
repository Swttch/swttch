# RTL (right-to-left) language support

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#158](https://github.com/Swttch/swttch/issues/158)

## What's new

The GUI now mirrors itself for right-to-left languages. A new **Settings →
General → "Enable RTL(Right-to-left)"** toggle flips the entire interface —
sidebar, chat, dialogs, dropdowns, everything — to read from right to left,
the way Persian and Arabic readers expect.

Two new **Interface Language** options ship alongside it:

- فارسی (Persian)
- العربية (Arabic)

Pick either one and RTL turns on for you automatically — no extra step needed.

## What you see

In **Settings → General**:

- A new **"Enable RTL(Right-to-left)"** toggle sits right below **Interface
  Language**. Turn it on and the whole app flips direction immediately: text
  alignment, icons that imply direction (back arrows, chevrons), dropdown/menu
  positioning, and the settings sidebar's slide-in direction all mirror to
  match.
- **Interface Language** now includes **فارسی (Persian)** and **العربية
  (Arabic)**, translated like every other supported language.

### Language and direction stay in sync — but you're still in control

Switching **Interface Language** to Persian or Arabic turns RTL on for you
automatically, and switching away from them back to any left-to-right
language turns it back off — you don't need to flip the toggle yourself when
you change languages.

That said, RTL isn't locked to the language choice. Once it's set (whether
automatically or by hand), you're free to flip the toggle yourself — for
example, keep the interface in English but read it mirrored, or use Persian
with a left-to-right layout. The auto-sync only fires the moment the reading
direction of your chosen language actually changes; after that, your manual
choice is respected.

## What stays put — code, terminal output, and math

Flipping the whole UI to RTL does not flip **code**. Fenced code blocks,
inline code, tool/terminal output, and math (KaTeX) always render
left-to-right, exactly as before, even when they're embedded in Persian or
Arabic prose. Mixing right-to-left identifiers, comments, or strings into a
snippet won't reorder punctuation, indentation, or operators — the part of
the message that has to stay unambiguous stays unambiguous.

## How it works

- The toggle is stored as a GUI-only, app-wide `uiDirection` setting (`"ltr"`
  by default) and applied as the `dir` attribute on the document root — the
  same mechanism the browser and JCEF use natively for bidi text and layout,
  so it composes correctly with anything already RTL-aware.
- The whole layout is built on CSS logical properties (`start`/`end` instead
  of hardcoded `left`/`right`), so container positioning, borders, and margins
  flip automatically with direction. Elements that use a *physical* transform
  instead — a toggle switch's sliding knob, back/chevron/arrow icons, a
  sidebar drawer's slide-in offset — carry an explicit RTL-mirrored
  counterpart so they still animate in the correct direction.
- Code blocks, inline code, and KaTeX math are explicitly pinned to
  left-to-right and isolated from the surrounding bidi context, so they don't
  inherit the mirrored direction no matter where they're embedded in the
  message.
- Direction is resolved as early as possible in the boot sequence (before the
  first paint, alongside the existing dark/light theme resolution) to avoid a
  flash of un-mirrored content when a new editor tab opens.

## For contributors

RTL is a distinct layer from **Interface Language (i18n)** ([Feature
009](../009-interface_language_i18n/en.md)) — a language can, in principle, be
translated without RTL, and RTL can, in principle, be toggled independent of
language. Persian and Arabic simply exercise both at once by default.
