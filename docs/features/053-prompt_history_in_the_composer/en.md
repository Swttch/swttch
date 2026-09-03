# Up and Down walk the prompts you typed

> Language: **English** · [한국어](./ko.md)

## What went wrong

Pressing Up in the composer is supposed to bring back the last thing you asked for, the way it does in a terminal. In a conversation you had just reopened, it usually brought back nothing at all.

When it did bring something back, it was often not something you had typed. `<command-name>/model</command-name>` and its XML siblings, the "[Request interrupted by user]" marker, the summary blob the CLI writes when a conversation is compacted, and the background-task notifications the CLI posts to itself all took their turn in the composer.

Messages you had typed while Claude was still working never appeared at all.

And on a long prompt, Up did not move the caret up a line. It jumped straight to the previous prompt, from wherever the caret happened to be.

## Why it happened

**The history was read from the wrong place.** It was built from the transcript the chat screen was holding, and the chat screen holds one page: the newest 50 *entries*. An entry is rarely a prompt. Across 119 conversations in this repository, 3,190 prompts were typed and only 129 of them — 4% — fell inside that newest page. The largest conversation had 193 prompts and none of them were in it.

**Almost everything in a transcript is a `user` entry.** In one 9,326-line conversation, 1,345 entries were of that kind and 1,281 of them were tool results being fed back to the model. Roughly 46 were typed by a person. Reading them all as prompts is what put the CLI's own writing into the composer.

**A message typed mid-turn is not written as a message.** The CLI records that it queued the text and, later, that it consumed it, and never writes the entry a reader would look for. The chat transcript already rebuilt those; the history did not know to.

**The arrow keys were guarded by searching the text for a line break.** A prompt that is one long sentence has no line break in it — the composer folds it across several rows to fit the width. Every row therefore counted as "the first line", and Up was handed to the history while you were still reading your way up a paragraph.

## What changed

**The prompts come from the backend now.** It holds the whole conversation, not a page of it, so reopening a conversation and pressing Up finds what you asked for however long ago you asked it. They arrive twenty at a time and extend as you keep walking back, so opening a conversation stays cheap: a prompt carries whatever you pasted into it, and sending a hundred of them at once would mean 21MB for the worst conversation measured here.

**Only what a person typed is offered.** The CLI marks some of its own entries, and those are skipped. The rest were measured against every conversation on the machine and are skipped by what they say — slash-command expansions, command output, interrupt markers, and the notifications the CLI posts into the conversation.

**A message typed while Claude was working is offered too.** It is recovered from the queue bookkeeping, using the same rule the chat transcript uses to rebuild the bubble, so a message cannot be visible on screen and missing from the history.

**A prompt you have just sent is there immediately**, before the CLI has written it down.

**The arrow keys move the caret first.** Up walks up the rows of a long prompt, then to its very first character. Only the press after that — one the composer would have done nothing with — brings back a prompt. Down mirrors it at the last character. A recalled prompt arrives with the caret on the edge you are walking towards, so holding the key keeps moving through prompts rather than back through the one you just recalled.

**Emptying the composer starts the walk over**, so the next Up begins at the most recent prompt instead of resuming where you left off.

## Limits

The history covers the conversation you are in. Prompts from your other conversations in the same project are not offered, even though the CLI's own terminal history reaches across them: recalling a line from a conversation you are not looking at is more surprise than help.

Slash commands are left out. The transcript stores `/model haiku` as an XML expansion rather than as what you typed, and a history that hands back the expansion would be worse than one that skips it.
