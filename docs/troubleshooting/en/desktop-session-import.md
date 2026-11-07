# Sessions created in the plugin don't appear in the Claude Desktop Code tab

🌐 **English** | [한국어](../ko/desktop-session-import.md) | [日本語](../ja/desktop-session-import.md) | [中文](../zh/desktop-session-import.md) | [Español](../es/desktop-session-import.md) | [Deutsch](../de/desktop-session-import.md) | [Français](../fr/desktop-session-import.md)

_Last updated: 2026-11-07_

A session created in the plugin does not show up in the Claude Desktop Code tab by itself. The other direction, opening a session that Desktop created inside the plugin, has always worked. The file Desktop builds its list from is undocumented, so we cannot write to it for you. What you can do is **press Desktop's own "import sessions" once**. From v0.36.0 on, new sessions are started so that this import picks them up, and the sessions you made before that can be prepared with one button in Settings.

## Symptoms

- A session you used in the plugin is missing from the list on the left of the Claude Desktop Code tab
- In the same folder, `claude --resume` in a terminal opens that session. The conversation is still there
- Sessions started in Desktop do appear in the plugin's session list

## Cause

Desktop does not show the conversation files as they are. It builds its list from an index of its own, and a session that is not in the index does not appear, even though its file exists.

Desktop's **Import Claude Code CLI Sessions** is what adds sessions to that index. But the import skips every session whose record says `sdk-cli`. The plugin starts Claude in the same non-interactive way SDK tools do, so every session record used to say `sdk-cli`.

From v0.36.0 the plugin starts new sessions under a name of its own: `swttch-jetbrains` inside an IDE and `swttch-standalone` in the browser (`ccg`). Desktop's import accepts those names.

## How to fix it

### 1. If you have sessions from before v0.36.0 — prepare them in the plugin

**Settings → General → Get sessions ready to import into Claude Desktop → Prepare**

- It prepares the sessions of the folder that is open. For another folder, open it and press the button again
- "Sessions prepared: N" means it is done
- A session that is running right now is left alone. If you see "Sessions left as they are because they are in use", close those sessions and press the button again
- If every session was made after v0.36.0, skip this step

### 2. Import them in Claude Desktop

Choose **Help → Troubleshooting → Import Claude Code CLI Sessions…** from the menu.

A dialog asks "Import N Claude Code sessions?". Press **Import sessions**. When it says "Imported N sessions", find them in the Code tab list.

- The import takes every session that is not in the list yet, **all at once**. You do not press it per session. Press it now and then, after you have made a few sessions in the plugin
- **Cancel** in the dialog imports nothing
- That menu location was checked in the macOS desktop app. It may differ on Windows and Linux

### 3. Keep working

A message you send in an imported session is added to the same conversation record. Open that session in the plugin again and the conversation you had in Desktop is there too.

Do not run one session in both places **at the same time**. Two programs would write to the same record file. Finish in one, then continue in the other.

## Good to know

- Only sessions **in folders you trust** are imported. "No CLI sessions to import" means the sessions that could be imported are already in your list, were deleted before, or are in folders Claude does not trust yet. If a plugin session does not show up, first check that you did step 1
- A session you **deleted** in Desktop is not imported again
- An imported session keeps its history and permission mode (except bypass permissions mode), but not its archive status or permission grants
- The button in step 1 only changes the `sdk-cli` written on each line of the record file to the new name, and leaves everything else as it was. A session made by another SDK tool in the same folder is changed with it
- We do not write to Desktop's own files to put sessions in its list. Those files are undocumented and an update of Desktop could break that quietly

### If it still does not work

In the same folder you can continue the session with `claude --resume` in a terminal.

## Related links

### Issue in this repository

- [#647 — Sessions created in the plugin don't appear in the Claude Desktop Code tab](https://github.com/Swttch/swttch/issues/647)

### Document in this repository

- [Principle exception: `CLAUDE_CODE_ENTRYPOINT` for the session import](../../principle-exceptions/647-entrypoint-for-desktop-import.md) — why this way, and what was checked
