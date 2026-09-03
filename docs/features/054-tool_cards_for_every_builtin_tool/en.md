# Every built-in tool now has a card, including the ones under their old names

> Language: **English** · [한국어](./ko.md)

## What went wrong

When Claude scheduled its own next wake-up in a `/loop`, the chat showed a bold **ScheduleWakeup** and, beside it, the word **unknown**. Nothing else. Not the delay it had picked, not the reason it gave, not the prompt it left for itself. A loop that ran for an hour was a column of identical `unknown` rows.

Eleven other built-in tools did the same thing: the three cron tools, the two worktree tools, the three MCP resource tools, the remote-trigger tool, the code-review reporting tool, and the tool Claude uses to write to you directly.

## Why it happened

The chat matches a tool call to a card by name, and a name it does not recognise falls through to a bare header with the `unknown` label. Twelve tool names had no card registered.

While fixing that, a second and less visible gap turned up. **The CLI keeps a table that renames older tools to their current ones** — `KillShell` and `KillBash` are now `TaskStop`, `BashOutput` and `AgentOutput` are now `TaskOutput`, `ListPeers` is now `ListAgents`, `Brief` is now `SendUserMessage`. A conversation recorded under an older CLI, or a user still running one, replays the *old* name, and only one of those pairings — `Task` and `Agent` — was registered. The other ten rendered as `unknown` too, and no amount of using the current CLI would have shown it.

A third problem only appeared once the cards existed. **A tool's arguments arrive a character at a time**, so while a call is still streaming, an argument that has not turned up yet looks exactly like one that was never sent. Cards that read meaning into a missing argument therefore announced that meaning as fact: the review card said **No findings** about a call that was in the middle of reporting two.

## What changed

**Twelve tools have cards.** Each one leads with the single fact that makes the row readable at a glance:

| Tool | What the row says |
| --- | --- |
| `ScheduleWakeup` | when it will wake (`in 1m 30s`), why, and whether the tick changed anything |
| `ReportFindings` | how many findings, each with its verdict, its `file:line`, and what was done about it |
| `CronCreate` · `CronDelete` · `CronList` | the schedule, whether it repeats, whether it survives a restart |
| `EnterWorktree` · `ExitWorktree` | which worktree, and — in warning colour — whether changes were discarded |
| the three MCP resource tools | the server and the resource address |
| `RemoteTrigger` | the action and what it acted on |
| `SendUserMessage` | the message itself, rendered as text rather than folded into a result box |

**The ten legacy names reach the same cards as their current ones.** A card that more than one name leads to now titles itself with the name the conversation actually recorded, so an old session reads with the words that are in it rather than today's replacements.

**A card no longer states something it cannot know yet.** While arguments are still arriving, the review card says nothing rather than "No findings", the MCP card does not claim "all servers", the worktree card does not claim the name was generated, and the cron card holds its defaults back. The same fix applied to a notebook card that had been calling a cell empty while its contents were still on the way.

## Limits

`SendUserMessage` and the ten legacy names are covered by tests but were never seen on screen, because the current CLI cannot produce them: the legacy names are translated away before they reach us, and `SendUserMessage` is not present in this CLI build at all. Every other card in this change was verified by making the real call and reading the result.
