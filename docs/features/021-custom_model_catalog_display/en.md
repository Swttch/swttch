# Models you connect yourself now show by their own name

> Language: **English** · [한국어](./ko.md)
>
> Related: [#217](https://github.com/Swttch/swttch/issues/217), [#202](https://github.com/Swttch/swttch/issues/202)

## The report

A user switched their model to the Haiku slot. Right after switching it showed
correctly — but the moment they sent a message and the conversation began, the
indicator under the input box had quietly slipped back to **Default**. They
captured it in [#217](https://github.com/Swttch/swttch/issues/217),
and two minutes later added a second screenshot: the row under the input box,
broken across two lines.

That second screenshot turned out to be the key. It showed their model list:

| Name in the list | Description under it |
|---|---|
| Default (recommended) | Use the default model (currently glm-5.2-mayi[1m]) |
| glm-5.2-mayi | Custom Opus model |
| glm-5.1-mayi | Custom Fable model |
| glm-4.7-mayi | Custom Sonnet model |
| glm-4.5-air-mayi | **Custom Haiku model** |

This user was not on Anthropic models — they had **connected a different model
themselves**. Claude Code supports this properly: you can slot your own model
into the Opus, Sonnet or Haiku positions, and the list then shows that model's
real name with a description saying which slot it fills.

## What was actually happening

One thing to be clear about first: **switching models was working correctly.**
In the first screenshot the user asked the model what it was, and it answered —
accurately — that it was GLM-4.5-Air-MAYI. It was running exactly as chosen.
The only thing lying was the display.

The cause was in how the screen worked out "which model is this?" It did so by
**looking for words like opus, sonnet or haiku inside the model's name**. That
always worked for Anthropic models, whose names read `claude-haiku-4-5`.

But `glm-4.5-air-mayi` contains no such word. So all five entries were
**classified as "unrecognized"** — and the entry picked when nothing is
recognized happened to be the Default one.

That is the first symptom. And the Default entry's description was not a short
name but a whole sentence: `Use the default model (currently glm-5.2-mayi[1m])`.
That sentence went straight into the row under the input box, where it did not
fit and wrapped onto a second line. That is the user's second screenshot.

Two symptoms, one root.

## What changed

**The core of it: when we don't know, we do nothing.** The real flaw was not
that a name went unrecognized — it was that "unrecognized" was **read as "this
must be the default"**. At that moment the user's choice is silently discarded.

Now, if the model Claude Code reports can't be found in the list, we **leave
your pick alone instead of reverting to the default**. The display stays put,
and subsequent requests keep going out with that model.

This matters because GLM is not the only model you can connect. We can't know
what names will show up next. So the rule is deliberately **independent of what
a name looks like**: an unfamiliar name can no longer cost you your selection.

**Recognition itself also got better.** Where it previously judged by name
alone, it now also reads **the description Claude Code already gave us** when
the name isn't conclusive. If it says `Custom Haiku model`, that is the Haiku
slot. We aren't guessing — we're finishing reading information we already had.
When the name is clear, the name still wins. Values whose shape differs slightly
from the list (a suffix like `glm-4.5-air-mayi[1m]`, or different
capitalization) now resolve to the same model too.

**An unknown model shows as itself.** A model we ultimately can't identify is
displayed by the name we received rather than dressed up as "Default", and the
model picker ticks no row at all when it isn't sure — rather than claiming a
selection the user never made.

**Labels stay short, like labels.** A model you connected yourself is shown by
its real name (`glm-4.5-air-mayi`) rather than its description. No more full
sentences in a label slot.

**The row under the input box no longer breaks.** However long a name gets, the
row stays on one line and trims the overflow with `…`; the full name is there on
hover. This applies to the whole row rather than just the model name, so the
permission indicator ("Bypass permissions") and the usage indicator — both split
in the user's screenshot — stay on one line too. The same holds in a narrow
window, or in a language whose translated labels run long.

## If you're on Anthropic models

Nothing changes for you. Labels like `Opus 5` and `Haiku 4.5` look exactly as
before. This fix adds a second look only for cases the name alone can't resolve,
so the path that already worked was left untouched.
