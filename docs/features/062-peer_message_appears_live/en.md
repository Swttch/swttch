# A message from another session shows up without a reload

> Language: **English** · [한국어](./ko.md)
>
> Related: [#423](https://github.com/Swttch/swttch/issues/423), [#383](https://github.com/Swttch/swttch/issues/383)

## The report

Open two Claude Code sessions on the same machine, have them talk to each other with `SendMessage`, and the message **never appears** on the receiving side.

Close the session and reopen it, and only then does it show up as a "message from another agent" card.

The real cost was not the missing card. It was that **nothing told you a card was missing.** When another session speaks to yours, your Claude reacts and starts composing an answer, and the answer is all you see. From where you sit, nobody said anything and Claude started talking on its own.

## Why it did not show

The rendering side was already built. The dedicated card for a message from another session came out of [#383](https://github.com/Swttch/swttch/issues/383).

What never reached the live view was the material to draw it with.

When the Claude Code CLI receives a message from another session, it writes that message **straight into the conversation's record file.** That is why reopening the session works: reopening reads that file from the top.

But the CLI does **not** send the same entry down its live output. Searching everything the backend had recorded off that stream, all 270 user entries that arrived live were tool results, and not one of them was a message from another session.

That was the original diagnosis, and it led to the conclusion that the CLI gives us nothing to work with and there was nothing to fix on our side. **That conclusion was wrong.**

The CLI does tell us, somewhere else. When the exchange that the incoming message started **comes to an end**, the message rides along on that closing signal — the sending session's name, the full body, all of it.

Our code was reading token usage and errors off that signal and throwing the rest away. The message had been arriving all along, and we were dropping it on the floor.

## What changed

The card is now built from what rides on that closing signal, and placed into the conversation. No reopening required.

![A card in the chat view: a "Message from another agent · claude-code-gui-jetbrains-17" label above a box holding the body of the message the other session sent](./assets/peer-message-card.png)

The card carries **the sending session's name** and **the body of the message**.

The boilerplate the CLI wraps around a message (the note explaining that a human did not type this, another session sent it) is left out. It is not written for a person to read, and the card's own label already says the same thing.

## The card sits where the exchange began

We only learn about the message when the exchange **ends**, not when it arrives.

Appending it on arrival would therefore put the card **below the reply it caused** — you would read the answer first and find the question underneath it.

Worse, reopening the session draws everything in record-file order, which puts the card back above the reply. The same two rows would **swap places every time the view was rebuilt.**

So the card is placed at the moment the exchange **started**. The closing signal reports how long that exchange took, so subtracting it from the current time gives the starting moment. The live view and the reopened view now show the same order.

## When it appears

**When the reply to the incoming message finishes** — not when the message arrives.

The closing signal is the only place the CLI mentions it live, so there is no way to know any earlier. A long reply means a correspondingly late card.

This is a remaining constraint, not a chosen design. If the CLI starts announcing these on arrival, the card can move earlier.

## What this does not cover

**Task-completion notices do not become cards.** The same slot also carries a signal for a finished background task, and that one has no body — turning it into a card would leave an empty box.

**The CLI does not send it every time.** Across four messages during verification, three produced a card and one did not arrive at all. What makes it drop out is not yet known. A dropped message is still in the record file, so **reopening the session shows it** — that case is no worse than it was before, just not better.

**This is not a way to reply to the other session.** The card only shows what was received; any reply is Claude's own decision.

## Related

- [#383](https://github.com/Swttch/swttch/issues/383) — the work that built the dedicated card for a message from another session
