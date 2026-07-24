# Clickable jump-to-line file references in chat

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#183](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/183), [#209](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/209), [#210](https://github.com/yhk1038/claude-code-gui-jetbrains/pull/210)

## What's new

When Claude points at a file in its answer — while explaining code, reviewing a
change, or saying where a bug lives — that reference is now **clickable**.
Clicking it opens the file in the JetBrains editor and moves the caret straight
to the referenced line (and column, when given).

Previously these references were dead: a Markdown file link even opened an empty
`localhost:<port>/…` browser tab instead of the file (#209).

## What you see

Two kinds of references become clickable:

- **Markdown file links** that Claude writes, e.g.
  `[ExampleService.java:120-135](./src/main/java/.../ExampleService.java#L120-L135)`.
  Clicking opens the file at line 120. Regular web links
  (`https://…`) stay normal links and still open in your browser.
- **Bare plain-text references** written inline in a sentence, e.g.
  `src/example/File.java:10`, `src/example/File.java:10:5` (line **and column**),
  or `src/example/File.java#L10-L25`. These are detected and turned into the same
  clickable reference.
- **`@`-mention chips** (`@src/file.ts#L42`) now also carry the line: clicking
  one jumps to line 42 instead of the top of the file.

There's also a **"Open files with"** setting (Settings → General). When your
chat is connected to a JetBrains IDE, it's fixed to that IDE and shows its
product badge — files always open in the editor. In a standalone browser with no
IDE attached, you can pick a detected editor (or a custom program); the default
is the operating system's default opener.

Relative paths are resolved against the project's working directory, so
`./src/x.ts` and `src/x.ts` both open the right file.

If a clicked reference points at a path that isn't on disk (a stale or made-up
path), the open no longer fails silently — a short toast tells you the file
couldn't be opened.

## What is deliberately left alone

Plain-text detection is intentionally conservative, so ordinary prose is never
turned into a broken link:

- A reference must contain a **path separator** (`/`). A bare `App.java:10` or a
  host like `example.com:8080` is **not** linkified.
- A **line locator** (`:line`, `:line:col`, or `#L…`) is required — a plain
  `10:30` time, or a mention of `src/app.ts` with no line, is left as text.
- Anything inside **inline code or a fenced code block**, inside an **existing
  link**, or inside a **URL** is never rewritten — code samples stay verbatim.

## How it works

- A reference is rendered as a clickable element that calls the IDE bridge's
  `openFile(path, line, column)` — the same bridge the editor-context and
  `@`-mention features already use, so no new backend protocol is involved. Line
  and column are 1-based; the IDE opens at the top when no line is given.
- When you open the chat in a **browser tab from an IDE session**, clicking a
  reference still opens the file in that **IDE** (at its line/column), not in the
  OS default app — the backend routes the open to the connected IDE whenever one
  is attached. A standalone browser with no IDE falls back to the OS opener.
- Plain-text references are linkified in a webview-only preprocessing step that
  masks code spans, existing links, and URLs before scanning, then hands the
  result to the same Markdown-link renderer — so both kinds of reference share
  one code path.
- Windows drive paths (`C:\proj\File.java`) are carried safely through Markdown
  sanitization and restored when the file is opened.

This is a webview-only change; the IDE already supported jump-to-line, so
existing installs gain it purely by updating the plugin.
