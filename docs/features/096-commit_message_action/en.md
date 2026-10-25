# Generate a commit message from the Commit tool window

> Language: **English** · [한국어](./ko.md)

> Related: [#426](https://github.com/Swttch/swttch/issues/426)

## What you see now

The Commit tool window has a Claude button in `Vcs.MessageActionGroup`. Select
one or more Git changes, then click the button. The plugin sends only the Git
working directory and selected paths to its local backend. The backend collects
the selected diffs and the last 20 commit subjects, asks Claude Code for a
commit message, and puts the returned message into the Commit message field.

The prompt asks Claude Code to follow the language, style, and scope of recent
commit messages when they are consistent. Otherwise it uses Conventional
Commits. The first line stays under 72 characters. A body is added only for
multiple logical changes. Each body line is one complete logical point or
sentence; the prompt does not split a sentence in the middle to fit a fixed
line width.

While Claude Code is generating, the same toolbar button becomes **Stop**.
Click it to disconnect the local request and terminate the one-shot CLI process.
Cancel leaves the existing Commit message field unchanged.

## What the action needs

| Needed | Detail |
| --- | --- |
| A Git change | At least one included change or included unversioned file |
| One Git root | All selected files must belong to the same Git repository |
| A supported project root | The repository root must be the IDE project or inside it |
| Claude Code | The CLI must be installed and authenticated |

If the workflow, message field, eligible selection, or backend project root is
missing, the button stays available and shows a warning instead of silently
doing nothing.

## Privacy and limits

The request stays on the local backend and includes selected paths plus their
Git diffs. Diffs are truncated at 120,000 characters, and a single request is
limited to 500 selected paths. Claude Code receives the prompt as a one-shot,
non-persistent request with a 120-second timeout. Restricted CLI mode is used
only for Anthropic's official API endpoint; another configured
`ANTHROPIC_BASE_URL` omits it for Anthropic-compatible gateway compatibility.
