# Adjustable chat line spacing

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#218](https://github.com/Swttch/swttch/issues/218), [#221](https://github.com/Swttch/swttch/pull/221)

## What's new

Chat messages now have an **adjustable line spacing** setting. If the default
spacing felt too tight to read comfortably, you can now loosen it (or tighten it)
to taste.

You'll find the control in **Settings → Appearance → Theme**, right below
**Font Size**.

## What you see

- A **Line Spacing** number field. Enter a value between **0.5** and **10**
  (in 0.1 steps). The default is **1.6** — the same spacing the chat used
  before — so nothing changes until you decide to adjust it.
- The change applies **live** to the message text as you type it, so you can
  find the value that reads best for you without reloading.
- Like the other appearance settings, line spacing can be set **globally**
  (User settings) or **per project** (Project settings). Leaving the project
  field empty falls back to your global value.

The setting affects the **body text of chat messages** — paragraphs, lists,
headings, quotes and tables. Code blocks and inline code keep their own fixed
spacing so code stays aligned.

## How it works

- The value is a standard CSS `line-height` multiplier. The webview applies it
  as a `--chat-line-height` CSS variable on the document root, which the chat
  message styles read. When the value is unset, the styles fall back to the
  previous `1.6`, so existing installs render exactly as before.
- The setting is stored alongside the other app settings (font size, theme, …)
  and validated on the backend to stay within the 0.5–10 range.

This is a settings + webview change; updating the plugin is enough to get it.
