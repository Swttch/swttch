# Your settings file can no longer be wiped

> Language: **English** · [한국어](./ko.md)

## What went wrong

One user's `~/.claude/settings.json` held twenty keys, and was left holding three.

```json
{
  "effortLevel": "high",
  "permissions": { "defaultMode": "bypassPermissions" },
  "model": "claude-fable-5[1m]"
}
```

Gone with the rest:

`includeCoAuthoredBy`, `env`, `statusLine`, `enabledPlugins`, `mcpServers`, `disabledMcpServers`,
`disabledMcpjsonServers`, `theme`, `language`, `uiLanguage`, `alwaysThinkingEnabled`,
`preferFastMode`, `switchModelsOnFlag`, `skipDangerousModePermissionPrompt`,
`respectGitignoreForContext`, `focusInputOnEditorContext`, `useCtrlEnterToSend`.

**That file is yours, not ours.** It holds your MCP servers, your status line, your plugin list and
your CLI preferences, and nothing we write can reconstruct any of it.

It is also easy to miss. The user above only found out later, when commits started carrying a
co-author trailer, because `includeCoAuthoredBy: false` was among the keys that disappeared.

Reported as [#386](https://github.com/Swttch/swttch/issues/386).

## Why it happened

Saving one setting means reading the whole file, replacing just the key you asked for, and writing
the file back. A JSON file cannot be edited a few characters at a time, so the whole file is
rewritten every save.

More than one program writes that file. The panel in your IDE, a standalone `ccg` in a terminal,
and the `claude` CLI itself all write to it.

When two of them write at the same moment, the shorter payload does not cover all of the longer
one, and you are left with **new content at the front and the tail of the old content still behind
it**. The file no longer reads as JSON.

That much is a rare accident. The real problem came next.

The reading code answered **"this file is empty" for a file it simply could not read.** So the next
save put one key on that empty content and wrote the whole file back. A twenty-key file was reborn
as a one-key file. The three keys that survived are simply what was saved after the rebirth.

**One rare accident grew into a guaranteed wipe.**

## What changed

### A save can no longer be caught half-finished

The new content is now written to a temporary file in the same folder and then renamed over the
original. Anything reading the file sees **either the old content or the new one, never a state in
between.**

The original file's permissions are carried over, so a file you had locked down to yourself does
not come back readable by everyone.

### A file we cannot read is never written over

If the file exists but does not read as JSON, the save is **refused and the file is left exactly as
it was.**

Files can break for reasons that have nothing to do with us: a full disk, a process killed
mid-write, another tool that stopped halfway. Whatever the cause, **we will not be the one that
erases it.**

### Our own saves are queued

Overlapping save requests inside one backend are now run one after another. You can have several
panels open and change settings in both without one discarding the other's change.

### Where it applies

Every file that carried the same risk:

| File | What it holds |
|---|---|
| `~/.claude/settings.json`, `settings.local.json` | Global Claude Code settings |
| `~/.claude.json` | MCP server config, project history |
| `<project>/.claude/settings.json`, `settings.local.json` | Per-project Claude Code settings |
| `<project>/.claude-code-gui/settings.json` | Per-project panel settings |
| Session title file | Chat titles you renamed yourself |
| `~/.claude-code-gui/profile.json`, `license.json` | Install info, sponsor license |

## How much better

Four programs writing the same settings file at once, five trials each:

| | Trials that kept every pre-existing key |
|---|---|
| Before the fix | **0 / 5** (every trial lost all of them) |
| After the fix | **5 / 5** (every trial kept all of them) |

## What is still true

If two separate programs save within about a millisecond of each other, one setting the other just
added may not make it in.

The file does not break, and nothing that was already in it disappears. Saving again applies it.

The `claude` CLI saves the same way, so this has always been true of the file. Removing it entirely
would mean locking every other program out of the file while one of them saves, which we chose not
to do.

## Links

- Report: [#386](https://github.com/Swttch/swttch/issues/386)
