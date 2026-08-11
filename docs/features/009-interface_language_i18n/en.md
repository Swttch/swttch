# Interface language (UI translations)

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#141](https://github.com/Swttch/swttch/issues/141), [#160](https://github.com/Swttch/swttch/pull/160)

## What's new

The whole GUI can now render in your language. Settings, the chat screen, tool
cards, dialogs, the session list, notifications — everything the app draws is
translated, across **10 languages**.

A new **Settings → General → Interface Language** option controls it, and it's
kept **separate from Claude's response language** (the existing "Language"
setting). Two different things:

- **Language** — the language *Claude replies in*. It's a free-text field, just
  like it is in your Claude settings file, so you can type any language.
- **Interface Language** — the language *the app's own UI* is drawn in. A dropdown
  of the languages we ship translations for.

## Supported interface languages

- English
- 한국어 (Korean)
- 日本語 (Japanese)
- 简体中文 (Simplified Chinese)
- 繁體中文 (Traditional Chinese)
- Español (Spanish)
- Français (French)
- Deutsch (German)
- Português (Portuguese)
- Русский (Russian)

## What you see

In **Settings → General**:

- **Language** is now a text box. If you've never set it, it's empty with an
  "English" placeholder (Claude's default); if you had a value, it's shown as-is
  and is never overwritten when you update the plugin.
- **Interface Language** is a new dropdown right below it. Options are labelled in
  each language's own name (한국어, 日本語, 简体中文, 繁體中文, …). Pick one and the
  UI switches immediately — the sidebar/tool window, chat, dialogs, and every
  screen follow.

If you never pick an interface language, the UI stays in **English** by default
(it does not follow your response language).

## How it works

- Translations run on **react-i18next**. Each area of the app has its own catalog
  of strings per language; anything not yet translated falls back to English, so
  the app always works.
- The interface language is a GUI-only preference; it does **not** touch Claude's
  behavior or your `settings.json` response language. Changing one never changes
  the other.
- Traditional and Simplified Chinese are shipped as **separate locales**
  (`繁體中文` / `简体中文`), the way Chinese is normally split.
- Adding a new language is intentionally easy for contributors — there's a guided
  `add-locale` skill in the repo that walks through creating the translation files
  and registering the language. See [`.claude/skills/add-locale/SKILL.md`](../../../.claude/skills/add-locale/SKILL.md).
