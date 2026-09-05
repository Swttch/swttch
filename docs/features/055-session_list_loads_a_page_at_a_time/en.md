# Past conversations now open a page at a time

> Language: **English** · [한국어](./ko.md)

## What was wrong

Opening the list of past conversations took seconds in a project that had accumulated sessions.

On a project with 217 sessions, building the list once took 4.9 seconds, and with other work running alongside it could pass 20.

Meanwhile the screen said **"No sessions yet"** — about a list that simply had not arrived.

## Why

Three things, stacked.

**One: reading a whole conversation file to get one line of title.**

A row in the list needs a title and a last-active time. But the first message that decides the title carries the system prompt along with it, so that single line averages 3.2MB. The median file is 3.27MB, which means about half of all conversations were being read end to end for a title.

With 217 of them in a project, that is 1.7GB.

**Two: sending the same request three times to draw one screen.**

The "include conversations from subfolders" setting decides **which folders get scanned**. It arrived after the screen had already rendered, so the list was built once for the narrow scope, thrown away, and built again for the wide one. The discarded half alone was 2.3 seconds.

**Three: this work is CPU-bound, so a busy machine multiplies it.**

The time goes into interpreting the file, not reading it. With other work running, these compete and the wait grows several times over. That is where 20 seconds came from.

## What changed

**The order is settled without opening the files.**

A conversation's last-active time sits at the end of its file, so only the end needs reading. Ordering all 259 takes 47 milliseconds.

File modification time would be cheaper still, and is not used. Claude Code appends records that are not conversation (file snapshots and the like), so a file can be newer while the conversation is not. Measured across 489 of them, 335 came out in a different order and one moved 205 places — recent conversations would drop down the list.

**Titles are read only for what is on screen.**

The first screen shows 30, and scrolling loads the next 30. Opening 30 files instead of 254 is most of the wait, gone.

| | Before | Now |
| --- | --- | --- |
| Conversation files opened | all 254 | 30 |
| Until the list appears | 4.9s | 0.3s |
| Requests per screen | 3 | 1 |

**Search works as it always did.**

Typing a query fetches everything still unloaded, in one request, and then filters. A conversation does not go missing from search because its page had not been fetched. Last month's conversations are still found.

**The screen no longer states what it does not know.**

While the list is loading it says **"Loading sessions…"** rather than "No sessions yet". Before the list arrives there is no way to tell an empty list from an unfetched one, and it was asserting the first.

## Worth knowing

Deleting and renaming a conversation from the list are unchanged.

The per-session message count (`messageCount`) is no longer calculated. Counting requires reading a file to its end, which is precisely the cost this removed. Nothing displayed it, so nothing changes on screen.
