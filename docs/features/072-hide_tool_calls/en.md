# Hide tool calls: read the answer, not the work

> Language: **English** · [한국어](./ko.md)

## The chat shows everything, and sometimes that is the problem

Ask for one small thing and the reply arrives buried. A `Grep` to find the file,
four `Read` cards to look at it, a `Bash` to check the tests, an `Edit`, another
`Bash`. The sentence you actually wanted sits at the bottom, and getting to it
means scrolling past all of it.

That transcript is the right default. It is how you catch the agent reading the
wrong file, and it is the reason the tool cards were built one by one. But it is
not what every session is for. Sometimes you already trust the work and only
want what came out of it.

The CLI has had an answer to this for a while. `/focus` toggles it live, and its
own description is the clearest statement of what it does:

```
/focus — Toggle focus view: just your prompt, summary, and response
```

You can also set it at startup, in `~/.claude/settings.json`:

```json
{ "viewMode": "focus" }
```

Neither of those did anything here. They configure the CLI's terminal renderer,
and the chat you are reading is our own React view, which never looks at them.
So a user who set `viewMode: "focus"` saw no change, and `/focus` typed into
this chat answered `/focus isn't available in this environment`, because the
command is declared as needing the terminal renderer, which the plugin does not run
([#475](https://github.com/Swttch/swttch/issues/475)).

## The setting

**Settings → Appearance → Chat → Hide tool calls.**

Off by default. Turn it on and a turn becomes your prompt, the assistant's text,
and the file changes it made. The commands and lookups in between go away.

It is a per-project setting, like the rest of Appearance. The Global tab sets it
everywhere; the Project tab overrides it for the repository you are in, which is
useful when you read one project closely and skim another.

The change is immediate. There is nothing to restart, no session to reload, and
nothing is dropped from the session file. The cards are hidden, not deleted, so
turning the setting back off brings the whole history back exactly as it was.

## What stays visible

The line is between a tool that changes something or asks you something, and a
tool that only looks or runs. The first is what the turn produced; the second is
how it got there, and that is the part being hidden.

| Tool | Why it stays |
| --- | --- |
| `Edit`, `Write`, `NotebookEdit` | They changed your files. The diff card is the result of the turn, not a step of it. |
| `AskUserQuestion` | It is a question addressed to you. Hidden, the session waits for an answer you were never shown. |
| `EnterPlanMode` | It announces that nothing will be changed until you approve a plan. |
| `ExitPlanMode` | It carries the plan itself, and the buttons that accept or reject it. |
| `SendUserMessage` | In the CLI's brief mode the assistant's plain text never reaches you and this call *is* the reply. Hidden, the turn would be blank. |

`Brief` is the older name for `SendUserMessage` and is treated the same way, so
a session recorded under an older CLI behaves like a current one.

Permission prompts are not tool cards and are unaffected: when the agent asks to
run something, you are still asked, with the setting on or off.

## What it hides

Everything else, including the ones that are easy to forget are tools:

- `Bash` and `PowerShell`, with their output. This is the one most people are
  turning the setting on for.
- `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`.
- `Task` / `Agent` and the whole background-task family.
- `TodoWrite`, so the checklist goes as well.
- MCP tools, including the JetBrains IDE ones.
- Tools we ship no card for at all, which normally render as a bare header.

Tool output is hidden along with the card. That includes the case where the card
itself is not on screen: when a result arrives whose call sits on a page of the
session that has not been loaded, the chat normally falls back to printing that
output as plain text. With the setting on, that fallback is hidden too.
Otherwise the loudest thing in the chat would be a raw `Bash` result, with no
card left to say where it came from. That fallback carries no tool name, so it
cannot make the exception for `Edit` and `Write`: a file change whose card is on
an unloaded page is hidden with the rest until you scroll up far enough to load
its card.

## Worth knowing

- **It is a display setting, and only that.** Nothing is removed from the
  session's JSONL, nothing is stopped from running, and the agent behaves
  identically. Other tools reading the same session see everything.
- **Turning it off shows the full history again**, including the turns that ran
  while it was on.
- **It does not turn on the CLI's brief mode.** That is a separate thing, gated
  on your account, in which the assistant stops writing plain text at all and
  speaks only through `SendUserMessage`. This setting hides cards; it does not
  change what the agent writes.
- **`viewMode` and `defaultView` in `~/.claude/settings.json` still do nothing
  here**, and we do not read them. They are the CLI's keys for the CLI's
  renderer, and adopting them would mean claiming to honour a setting whose
  other values (`verbose`, `default`) have no meaning in this UI.
- **Collapsing a reply is still there and is a different tool.** The fold arrow
  next to a prompt hides one reply on demand; this setting is a standing choice
  about every turn.

## If you want the cards back for one turn

Turn the setting off, read the turn, turn it back on. There is no per-turn
override: the toggle is one click away in Settings, and a second control that
did the same thing for one message would need a home on every card that is not
being drawn.
