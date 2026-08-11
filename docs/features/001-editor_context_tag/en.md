# Editor Context Tag

> Languages: **English** · [한국어](./ko.md)
>
> Related: [Issue #122](https://github.com/Swttch/swttch/issues/122) · [PR #133](https://github.com/Swttch/swttch/pull/133)

## What's new

Claude Code with GUI now **automatically shows the file you're looking at — or the lines you've selected — as a context tag right above the chat input.** When you send a message, that file or selection is handed to Claude along with your prompt, so you no longer have to describe "the file I'm in" or paste code by hand.

This mirrors the experience of the Claude Code extension in Cursor / VS Code, brought to JetBrains IDEs.

## How it works

- **Open or switch to a file tab** → a tag appears in the composer footer showing the file name (e.g. `📄 settings.json`). Claude will treat that file as context for your next message.
- **Select some lines in the editor** → the tag updates to show the line range (e.g. `settings.json:42-51`), and the selected code travels with your message.
- **Click the tag to toggle it.** When included, it shows a file icon; click it and it switches to an eye-off icon (`👁️‍🗨️`), meaning that file/selection will *not* be sent. Click again to include it back.
- The tag only appears while a Claude Code tab is open, and it never points at the Claude panel itself.

You can keep typing normally — the tag works quietly in the background and only attaches context when you actually send a message.

> **Tip:** This is separate from the existing **Alt+K** action. Alt+K *inserts* a file path as an `@mention` into your input on demand; the context tag *passively* tracks whatever you're currently viewing and lets you toggle it. Both can be used together.

## Respect .gitignore (optional, off by default)

Some files you open — like `.env` or other secrets — are listed in `.gitignore` and you may not want their contents leaving your machine.

Go to **Settings → General → `Respect .gitignore for editor context`** and turn it on. While enabled, when the file you're viewing is gitignored, only its **path** is shared with Claude — the file's **contents are stripped out**. The tag still shows so you stay aware of it.

This setting is **off by default**, so nothing changes unless you opt in. It can be set per scope (global / project) like other settings.

## Notes

- Slash commands (messages starting with `/`) never carry the editor context, so command behavior stays predictable.
- If the same file/selection is unchanged, it isn't re-attached to every consecutive message — it's sent once until you move or change the selection.
