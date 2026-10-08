# The /btw side question window

> Languages: **English** · [한국어](./ko.md)
>
> Related: [/reload-plugins and /btw in the GUI](../028-cli_only_slash_commands/en.md) · branch `feat/btw-side-panel`

## What's new

`/btw` side questions no longer land in the chat. They open in **their own window above the chat**, the same kind of window as the background-agent transcript. The question and its answer stay in that window, **nothing is echoed into the main chat**, and the main agent keeps working on whatever it was doing, so a side answer can no longer show up in the middle of its reply.

## Asking a side question

Type `/btw` followed by your question in the message box:

```
/btw what does this flag do?
```

The window opens, shows your question with a "Thinking…" line, and then the answer. The main conversation is left exactly where it was: not interrupted, and the question is not added to it.

![The "Side question" window open above a chat where the main agent's answer about the repository is still visible behind it. The question "What does the --resume flag do?" sits on the right, and under it a dot pulses next to "Thinking…".](./assets/side-question-pending.png)

![The same window once the answer has arrived: a formatted reply listing `claude --resume <session-id>`, `claude --resume` with no ID, `--continue` (`-c`) and `--fork-session`, while the main conversation stays untouched behind the window.](./assets/side-question-answered.png)

If you type a **bare `/btw`**, the window just opens, empty, with the hint "Ask anything about what is going on — the main agent keeps working." The CLI would only answer an empty side question with its usage line, so nothing is sent.

![The "Side question" window open above an empty chat, subtitled "Answered without interrupting the main conversation, and not added to it." Its list is empty and reads "Ask anything about what is going on — the main agent keeps working.", with its own message box at the bottom showing "Ask a quick side question…".](./assets/side-question-window-empty.png)

The window has **its own message box**. Whatever you type there is sent as a side question, so you do not need to type `/btw` again. A slash command typed there is a question **about** that command, not a command that runs.

## Opening and closing it

| Action | How |
|--------|-----|
| Open | Type `/btw` (with or without a question) |
| Toggle from anywhere | **Cmd+Shift+B** on macOS, **Ctrl+Shift+B** on Windows and Linux. Also listed in the shortcuts help |
| Close | **Escape**, a click outside the window, or the close button |
| Clear | The **trash** button in the header empties the list |
| Resize | Drag the **bottom edge** of the window |

Closing the window does not lose anything. Reopen it and the questions are still there.

## What is kept, and for how long

- Side questions are kept **per session**: switching to another session shows that session's side questions.
- They are kept **in memory only**. Reloading the GUI, restarting the IDE or closing the tab empties them. The CLI does not write side questions to the session transcript either, so there is nothing to restore them from.
- Clearing with the trash button removes them for good.

## If the question cannot reach Claude

If the request cannot reach the CLI, or the CLI stops before it answers (it crashed, or could not start), the question **fails in the window**: it shows "Couldn't get an answer from Claude for this side question. Try again." Ask it again once Claude is running.

The question is **never sent to the main chat instead**. Sending `/btw …` there as plain text would put the side question into the very conversation it is meant to stay out of, and the CLI refuses it there anyway ([#270](https://github.com/Swttch/swttch/issues/270)).

A side question also **never restarts the main agent**. When a CLI exists for the session but is not ready to take input at that moment (it is still starting, for example), the question fails rather than having the GUI start Claude again under it.

### Asking first thing in a reopened session

When you open a session from history and `/btw` is the first thing you do, the GUI now **starts the CLI for that session** to answer it. Before, there was no running CLI yet, so the question fell back to text in the main chat. The same applies to a new chat where `/btw` is the first message.

## Limits

- Side questions are not saved: they disappear when the GUI reloads.
- They are not added to the conversation, so Claude's main thread does not know about them.
- A slash command typed in the window is asked about, never executed.
