# Session management MCP: let Claude manage your other Claude Code sessions

> Languages: **English** · [한국어](./ko.md)

## What this is

The session-management MCP is a small separate program, the npm package `@swttch/session-manager-mcp`, that gives Claude a set of tools for working with your **other** Claude Code sessions. With it attached, you can ask Claude things like "which of my sessions touched the billing code?", "send this note to my other session", "put these three sessions in a group" or "archive the sessions I finished last week", and Claude does it through those tools instead of telling you to click around.

It is the same program you can add in a terminal with `claude mcp add swttch-sessions -- npx -y @swttch/session-manager-mcp --area session_mgmt`. The app does the same job for you: you install the package from **Settings → About → Dependencies** (or from **Settings → General → Session manager**), and from then on the app hands the program to every Claude process it starts, using Claude Code's documented `--mcp-config` option.

**Nothing is installed until you press the button, and installing is what turns it on.** There is no separate switch. The reason to think before installing is cost, explained next.

## What it costs: the model's context

Attached tools take up part of the model's context for the whole session: their names from the start, and their full descriptions once Claude loads them. That space is not available for your conversation. The app attaches two areas, 27 tools together:

- `session_mgmt` (20 tools) works with the sessions you already have: find, read, message, stop, archive.
- `session` (7 tools) starts new sessions.

The package has eleven areas, 69 tools in all. The other nine are not attached unless you ask for them in a settings file (see "Choosing areas, or turning it off for a project").

| Area | What it gives Claude | Tools |
|------|----------------------|-------|
| `session_mgmt` | List, search, message, rename, archive and stop sessions, and read their recent turns | 20 |
| `session` | Start new sessions and hand off work | 7 |
| `sidebar` | Groups, pins and unread marks in the session list | 13 |
| `window` | Split view and sidebar. Needs Swttch Desktop | 4 |
| `view` | Panes and transcript view. Needs Swttch Desktop | 4 |
| `host` | Open files, free disk, sync branches | 7 |
| `pr` | Pull request status, binding and auto-merge | 5 |
| `settings` | Read and change preferences | 2 |
| `directory` | Change a session's working folder | 2 |
| `connectors` | Check and toggle a session's MCP connectors | 3 |
| `turn` | The task list and wrap-up shown under a reply | 2 |

**`window` and `view` do nothing useful inside an IDE.** They only queue requests for the screen of Swttch Desktop. Inside a JetBrains IDE nothing reads those requests, so attaching them only spends context. Some tools in other areas are listed in the package as "not yet" and answer that they are unavailable; the package's own README keeps the current status of every tool.

## Installing it

Open **Settings → About** and find the **Dependencies** section. The row named `@swttch/session-manager-mcp` shows **Install** and "Not installed".

![The Dependencies section before the package is installed: the row shows an Install button and "Not installed".](./assets/not-installed.jpg)

Press **Install**. A confirmation says that this installs `@swttch/session-manager-mcp` globally on this machine, that it is attached to every Claude Code session the app starts from then on, and that its tools take up part of Claude's context. Confirm it. The app installs the package with the package manager that fits your machine (npm, Volta, pnpm and so on, the same way it installs the extend kit) and then checks that it can find the program. The package is about 200 KB.

![The Dependencies section after installing: the row shows "Up to date", the version 0.1.1, a re-check button and a trash button.](./assets/installed.jpg)

**It applies to the next Claude process that starts.** A Claude process that is already running keeps the tools it started with. To get the tools in a conversation that is open now, start a new session, or let the conversation's Claude process restart.

## What happens when Claude starts

When the package is installed, the app adds one `--mcp-config` argument to the `claude` command it starts. The argument has one server per attached area, named `swttch_<area>`, so Claude sees tools named like `mcp__swttch_session_mgmt__list_sessions`. Each server is told which session is calling (so "this session" means the right one) and where the app keeps its data. Your own MCP servers keep loading as usual.

If the package is not installed, no argument is added at all.

While a session is running, the server also appears in the app's **MCP Servers** window, next to your other servers, as `swttch_session_mgmt` and `swttch_session`. Each area is a small separate process (about 10 MB) that lives as long as the session's Claude process.

## Starting a session from a session

Tell Claude, in any session, something like "start a session for the billing refactor". Claude writes a brief and starts a separate Claude Code session with it. The new session runs on its own in the background, in the same folder unless you say otherwise, and appears in the session list. When you open it, the top of the conversation shows that Claude started it from another session, with the brief.

In the conversation that started it, the start is drawn as a card with the new session's title; a click on the card opens that session. When Claude mentions the session in its reply, the name is a link that opens it too.

When the new session ends its turn, the session that started it receives a message with the new session's last reply (the first 400 characters when it is longer). It is drawn as "Received message from" with the session's name, and Claude there tells you the result. You do not have to ask or wait. This happens only while the session that started it is still open in the app; if you closed it in the meantime, open the new session to read its answer.

In the session list (the dropdown in the top bar and the session panel alike), a session that another session started is drawn under that session, indented, with a line running down from it. A session started by a started session is drawn one step further in, under the session that started it, so the list shows who started whom at every level. Sessions under the same session are listed in the order they were started. Every session that started others carries a small arrow after its title: a click folds what it started away, and another click brings it back. The whole tree sits where its most recent session belongs, so a session that is working now is not buried under a session that last spoke days ago. When a search matches only a started session, it is shown as an ordinary row.

You can also say "start it and move it to the top level". Claude then detaches the new session: it is no longer linked to the session that started it and no longer reports to it. The conversation shows a line saying the session was moved to the top level, and the session list shows it as a row of its own.

A session renamed through these tools ("rename this session to ...") gets its name where Claude Code itself keeps it, so the new name shows in this app's session list, in the terminal's `claude --resume` list and in the other Claude Code apps alike.

The other session tools read as lines of their own as well ("Looked up session", "Listed sessions", "Archived session", and "Deleted session" with the title of the session that was deleted, or "Deleting session" while the call runs or when the app refused it), the way the desktop app shows the same work. These lines and the card are drawn in the Normal, Thinking and Verbose views; the Classic view shows the calls as ordinary tool calls.

The session rail (the panel opened from the dock icon in the header) has a Linked sessions section while the package is installed. It shows the session that started this one and the sessions this one started. Both say None when there are none, and a row opens that session. You can change the links by hand there: each linked session is a row that you can open (its tooltip shows the full title), and a square minus button on the row (shown when the pointer is over it) unlinks it. The text button at the right end of each relation's title (Change for the parent, Add for the children) opens a search list of the sessions that can be linked: type to filter, pick one to put it there. Pressing anywhere outside the list closes it. The parent holds one session, so picking another replaces it; unlinking the parent makes the session top-level. The list for children stays open so several can be added in a row. Unlinking does not delete a session. A parent that is not in the list (its transcript was deleted, or it belongs to another folder) shows as a dimmed row saying so, which can be unlinked the same way. A session put under a parent this way does not report the end of its turns to it; that is set up only when a session is started. Putting a session under a parent needs package version 0.3.0 or later, and taking one to the top level or handing it back to the desktop app's record needs 0.4.0, which an installed package updates to by itself. A parent you took away on purpose stays removed: it is recorded as your choice, apart from a session nothing was chosen for. Claude can do the same through the `set_session_parent` tool.

## Archiving sessions

Archiving takes a session out of your way without deleting it. It needs package version 0.4.0 or later, which an installed package updates to by itself. Archiving marks **only the session you archive**: the sessions it started are not archived with it, and no worktree is removed.

- **In the session list** (the dropdown in the top bar and the session panel alike), a row has an archive button between the rename button and the delete button, shown when the pointer is over the row. Archived sessions are left out of the list. The toggle at the far right end of the filter row shows them again.
- **An archived row** is drawn faint: its title, its time and its project are at 30 percent opacity, so that it stands out from the rest at a glance. The rename and delete buttons are not dimmed, and the archive button is replaced by an unarchive button in the same place.
- **In the session rail**, an archived session in the Linked sessions section has a small "Archived" pill before its title, so a parent or child that is out of sight in the list is still known for what it is.
- **In the chat**, an archived session shows a notice in place of the input: "This session is archived. To keep working in it, unarchive it." with an **Unarchive** button. On a wide screen the button sits beside the sentence; on a narrow one it moves under it. Press it and the input comes back.
- **From the desktop app**, a session archived in the Claude desktop app is shown as archived here too, while the sync described next is on. A session you unarchive here stays unarchived even when the desktop app still has it archived, because what you chose here is kept as your choice.

![The session dropdown with archived sessions shown: the archived row is faint, and its rename, unarchive and delete buttons are on the right.](./assets/archived-in-list.jpg)

![The notice that replaces the chat input in an archived session: "This session is archived. To keep working in it, unarchive it." with an Unarchive button.](./assets/archived-banner.jpg)

## Showing what the Claude desktop app records

The Claude desktop app keeps its own record of your sessions: who started whom, which are archived, their titles, and which are running. With the switch **Settings → General → Session manager → Reflect changes from Claude Desktop** on, this app reads that record and shows it:

- **Parent and child sessions.** A session that another session started in the desktop app is shown under that session. A session you moved to the top level there (by hand, or because Claude did it) is shown at the top level here. Looking only at who created a session is not enough: a session that was created by another one and then taken to the top level is a top-level session in the desktop app.
- **Archived sessions.** Archiving or unarchiving in the desktop app hides or shows the session here as well.
- **Titles.** Renaming a session in the desktop app renames it here without reloading.
- **Running sessions.** A session that is working in the desktop app shows the running marker in the session list and on its row in the session rail's Linked sessions section, the way the desktop app does, and it is counted in the list's Active filter. The desktop app has no field that says a turn is running, so the app takes a user message that is newer than the last end of a turn as a running turn. A session that has written nothing for 30 minutes is not shown as running, so that a turn that was cut off does not look running for good.

Changes in the desktop app arrive as they happen: the app watches the desktop app's session folder and reads again what changed.

**It only reads.** Nothing is ever written to the desktop app's files, which belong to the desktop app. Its format is not a contract, so a file that cannot be read is skipped, and a machine without the desktop app simply shows nothing extra.

**What you choose here is yours.** A parent you set in the session rail, a session you took to the top level, and a session you archived or unarchived are recorded in the package as your choice, and the desktop app's record does not overwrite them. The **Claude button** at the right end of the Linked sessions title hands the sessions you changed by hand back to what the desktop app records. Its tooltip says what it does at that moment: it resets the links you changed, it says that everything already matches the desktop app, or it says that the desktop app has no record of this session's links. When the switch is off the button stays and the tooltip still says what it does, and pressing it opens Settings → General, where the switch is.

![The session rail's Linked sessions section: the Claude button at the right of the title, the parent session, and two child sessions, each led by an "Archived" pill.](./assets/rail-linked-sessions.jpg)

**It is a sponsor feature.** The switch can be turned on only by a sponsor, and it is off until then. Turning it off never asks. While it is off, or when the person is not a sponsor, nothing from the desktop app's files reaches the lists and the running marker is dropped; what the package recorded and what this app knows itself are shown as before. Turning the switch on or off applies at once.

The same section has the package's install button, version and removal at the right of its title, so the package can be installed, updated and removed from there as well as from **Settings → About**. Under **Learn more** the switch lists what it reflects, item by item.

![Settings, General, Session manager: the package's version and up-to-date mark at the right of the title, and the two sponsor-only switches, "Reflect changes from Claude Desktop" and "Drag a session onto another to make it a child session".](./assets/settings-session-manager.jpg)

## Dragging sessions in the list

Settings → General → Session manager has a second switch, **Drag a session onto another to make it a child session**. It is off by default and for sponsors only. With it on, in the session list (the dropdown in the top bar and the session panel alike):

- Drag a session row onto another session row and the dragged session becomes a child of that session. The row under the pointer lights up when the drop is allowed, and the other rows dim.
- Drag a session that is under another one to the strip that appears over the top of the list ("Drop here to make it a top-level session") and it becomes a top-level session.

It does what the Change button in the session rail does, by dragging. A session cannot be dropped onto itself, onto a session it started (that would make a loop), or onto the session it is already under. Dropping onto a top-level session that has no parent does nothing to it. The buttons on a row (rename, archive, delete, the folding arrow) are still plain buttons: a press on them never starts a drag. Needs package version 0.3.0 for a parent and 0.4.0 for the top level.

## Keeping it up to date

You do not update it yourself. **If the package is installed** and a newer version exists, the app updates it:

- when the app's backend starts, and
- whenever the version is looked up, which is what opening **Settings → About** or pressing the row's re-check button does.

While the update runs, the row shows **Updating…** and there is nothing to press. When it is over the row shows the new version and "Up to date".

If the automatic update fails (no permission to write to the package manager's global folder, for example), the row shows an **Update** button instead. Pressing it runs the update by hand and shows the reason if it fails again.

**If the package is not installed, the app never installs it by itself.**

## Removing it

Press the trash button at the end of the row. A confirmation explains that the package is removed from this machine and is no longer attached to new Claude processes. This is how you turn it off. Reinstalling is one button press.

While the package is not installed, the session list draws every session as a row of its own: sessions are no longer drawn under the ones that started them, and the folding arrows are gone. What was recorded about who started whom is kept, so the tree is drawn again once the package is back (within a minute when it was installed from a terminal).

## Choosing areas, or turning it off for a project

There is no screen for this. The setting `sessionMcp` in a settings file changes what an installed package attaches.

To attach more areas everywhere, put it in `~/.claude-code-gui/settings.js`. To change it for one project, put it in that project's `.claude-code-gui/settings.json`, for example

```json
{ "sessionMcp": { "areas": ["session_mgmt", "session", "pr"] } }
```

To keep an installed package out of one project:

```json
{ "sessionMcp": { "enabled": false } }
```

A project value wins over the global one. Names that are not areas are ignored.

Keep `session` in the list if you want to say "start a session for this task". Starting a session is a tool of the `session` area, not of `session_mgmt`. Without it Claude has no such tool and may run an ordinary subagent inside the current session instead.

## The rest of the Dependencies section

The section lists the separately installed programs the app uses, each with the version found on this machine. Its rows read the same way as the Claude Code version row above them: a status on the left, the version, and a button that checks again.

| Row | What it is | What you can do there |
|-----|-----------|------------------------|
| `@swttch/extend-kit` | Runs voice input, read aloud and the usage panel | Install, update, check again. The Voice input section keeps its own control for the same package, including removal |
| `@swttch/session-manager-mcp` | This feature | Install, remove, check again. Updates are automatic |
| Node.js | The runtime the app's backend runs on | Nothing. It is reported for bug reports |
| cloudflared | Opens the remote tunnel | Check again. It is installed when you first turn the tunnel on |

## Safety

These tools can do real things: delete and archive sessions, stop a running turn, change a session's model and permission mode. The package is deliberately conservative, for example its file tools only accept paths inside the calling session's folder. Claude Code's own permission prompts apply to every tool call, so read-only tools are good candidates for an allow rule, and delete, archive and stop are not.

**In a session running in Bypass permissions mode, none of those prompts appear.** With the package installed and that mode on, the model can archive or stop your other sessions without asking. Install it with that in mind.

## Questions and troubleshooting

**The install fails with a permission message.** Your package manager's global folder needs administrator rights. The message contains the exact command to run in a terminal. Run it there, then press the row's re-check button.

**I installed it but Claude has no `swttch` tools.** Check that the current conversation's Claude process started after the install (see "It applies to the next Claude process that starts"), and that no settings file sets `sessionMcp.enabled` to `false` or leaves `areas` empty.

**I installed or removed it in a terminal and the row is wrong.** Press the re-check button at the end of the row.

**I installed it in a terminal and the next session had no tools.** The app is not told about a terminal install. The first Claude process started after it looks again in the background, and the processes started after that one get the tools. Opening **Settings → About** makes the app look at once.

**Do I have to use this screen?** No. Anyone can attach the same program in a terminal with `claude mcp add`, as shown at the top. The screen exists so that the install and the updates do not need a terminal.

**The tools say "unavailable".** Those tools need Swttch Desktop (the `window` and `view` areas) or are not built yet. See the table above.
