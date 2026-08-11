# Effort & Fast Mode

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#121](https://github.com/Swttch/swttch/issues/121), [#152](https://github.com/Swttch/swttch/issues/152)

Two of the controls in the **Model** section let you trade speed for depth on a per-model basis: **Effort** and **Fast mode**. Both mirror what the Claude Code CLI already lets you set, surfaced as inline controls so you never have to leave the chat.

## Effort

**Effort** is how hard Claude works on a response — its reasoning budget. Higher effort means more thorough thinking (slower, more tokens); lower effort means quicker, cheaper replies. It's the same setting the CLI exposes per model.

### The slider

Effort is a **slider**, not a list. Each notch is one level the current model supports:

| Level | Label |
|-------|-------|
| `low` | Low |
| `medium` | Medium |
| `high` | High |
| `xhigh` | Extra high |
| `max` | Max |

- **Auto** is not a notch — it's the label shown while you haven't picked a level, meaning "use the CLI's default." As soon as you pick a level the slider stays within the real levels.
- **Click or drag** the slider to jump to a level. **Clicking the row** (or pressing Enter on it) cycles to the next level, wrapping back to the first.

### Ultracode (the top step)

When a model supports the `xhigh` level, the slider gains one extra step past Max, rendered in **purple**: **Ultracode**. Landing on it engages `xhigh` effort **plus** standing workflow orchestration — the maximum-capability setting. It's only offered when the model supports `xhigh` and Workflows aren't disabled.

### Where to find it

- **Slash command panel** (type `/`) → **Model** section → the **Effort** row, with the current level shown next to the label (e.g. *Effort (Extra high)*).
- **Modes popup** (**Shift + Tab**) → the effort slider sits at the bottom.

## Fast mode

**Fast mode** prioritizes faster output. It's available on **Opus** models only. You'll find it in the **Model** section as the **Toggle fast mode** switch.

## Model support at a glance

Which controls apply depends on the model you're using — the CLI reports each model's capabilities, and the GUI follows them exactly:

| Model | Effort | Levels | Ultracode | Fast mode |
|-------|:---:|---|:---:|:---:|
| **Opus** | ✅ | Low · Medium · High · Extra high · Max | ✅ | ✅ |
| **Sonnet** | ✅ | Low · Medium · High · Max *(no Extra high)* | ❌ | ❌ |
| **Haiku** | ❌ | — | ❌ | ❌ |

A couple of consequences worth knowing:

- **Sonnet has no Extra high**, so it also has **no Ultracode step** — that's a model capability, not a bug.
- **Fast mode is Opus-only**, so on Sonnet and Haiku the toggle is inactive.

## What happens on models that don't support a control

Rather than hiding a control on models that don't support it, the row stays visible but **disabled (greyed out)**, and hovering it shows a short tooltip explaining why — for example *"This model doesn't support effort levels"* or *"Fast mode is only available on Opus models"*. This keeps the Model section consistent no matter which model you're on, so a missing control never looks like something broke ([#152](https://github.com/Swttch/swttch/issues/152)).

## Notes

- These controls reflect the **currently running session model** — switch models and the available effort levels, Ultracode step, and Fast mode availability update to match.
- Everything here maps to what the CLI already supports; the GUI just makes it a click instead of a flag.
