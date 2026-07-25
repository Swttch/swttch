# @ file mentions find submodule files, and honor the `fileSuggestion` setting

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#201](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/201)

## What's new

Two improvements to the `@` file-mention picker in the chat input:

1. **Files inside git submodules now show up.** If your repository vendors code
   through git submodules, typing `@` and searching for a file inside a
   submodule (e.g. `Assets/GameFramework/Editor/Foo.asmdef`) previously found
   nothing — the picker only saw the submodule's top-level folder, never the
   files tracked inside it. Now those files are listed like any other.

2. **The CLI's `fileSuggestion` setting is respected.** Claude Code lets you
   override how the `@` file index is built with a `fileSuggestion` command in
   `settings.json`. The GUI ignored it before; now it runs your command exactly
   as the CLI does, so a setting that works in `claude` works here too.

## What you see

- **Submodule files just appear** in the `@` list — no configuration needed.
- **A custom command** can be set at **Settings → General → `fileSuggestion`**.
  Type a shell command (for example `git ls-files --recurse-submodules`) and it
  builds the `@` index; leave it empty to use the built-in index. This is the
  same value as the `fileSuggestion` setting in `settings.json`, so you can edit
  it here or in the file — either scope (User/Project) works.

## How it works

Both paths keep the project's **CLI-equivalence** principle — whatever a CLI
user can do from `settings.json`, you can do from the GUI, with no dependency on
private protocols.

- **Built-in index (default).** The file list is built from `git ls-files`.
  `git ls-files --recurse-submodules` cannot be combined with `--others`
  (git rejects it as an "unsupported mode"), so the backend issues two calls —
  one for tracked files recursing into submodules, one for untracked-but-not-
  ignored files — and merges them. `.gitignore` is still honored, so build
  output and `node_modules` stay out of the list.

- **`fileSuggestion` command.** When set, the backend hands the index to your
  command: it receives the current query as `{"query":"…"}` JSON on stdin and
  prints newline-separated file paths on stdout (capped at 15, matching the
  CLI). The command runs under a shell with `CLAUDE_PROJECT_DIR` set, the same
  as the CLI's hooks. If it fails for any reason, the picker quietly falls back
  to the built-in index so it never breaks.
