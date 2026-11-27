# Up and Down walk the messages you sent

> Language: **English** · [한국어](./ko.md)

Press Up in the message box to bring back what you sent before, as in a terminal, and Down to come back. What you were
writing is kept while you look, and is waiting for you when you come back down.

First made to work in a reopened conversation in [#395](https://github.com/Swttch/swttch/pull/395). The draft, the
guard, the label and the shared draft came with [#735](https://github.com/Swttch/swttch/issues/735).

## Moving, then walking

**The arrow keys move the caret first.** Up walks up the rows of your text, wrapped rows included, then to its very
first character. Down mirrors it to the very last one. This is the same on macOS, Linux and Windows. Holding Shift
selects text, and never recalls.

**Leaving your draft takes one more press.** At the very start of what you are writing, Up first shows a line over the
text:

> Press Up again to browse history (your draft is kept)

The next Up goes to your last message. Any other key or a click makes the line go away. Inside the history there is no
such line: each press moves on.

**While you walk, the box says where you are**, for example `History 19/19`. The newest message is the highest number,
the oldest is 1, and your draft has no number. The total is the number of ticks on the [send index](../071-send_index/en.md),
because both show the same list.

While a draft is waiting, the line also says **↓ to restore your draft**. The box grows and shrinks smoothly as the line
comes and goes.

A message recalled with Up arrives with the caret at its start, so the next Up moves straight on. One recalled with
Down arrives with the caret at its end.

## Seeing and clearing the changes

While any message has a change kept, the line over the box carries a mark with their number: **Edited** when the message
on screen is one of them, a dim **Edits** when it is not. The draft shows it too.

Press the mark to open **History**.

- Every message you sent is listed in the order sent (1 at the top), with its number and one line of preview.
- Changed ones carry an orange dot (**Edited** on hover) and start open.
- Pressing a row, or the arrow at its end, shows the whole message, pictures included. A changed one shows your change.
- **Load into input** closes the window and puts that message in the box.
- The undo icon (**Discard edit**) removes the change at once.

## A message comes back as you sent it

Its pictures return to the attachment row, reply and excerpt cards return above the text, and a message addressed to
another session with `@@` is addressed to it again.

**Change a recalled message and the change stays with it.** Walk away and back and you find your changed version,
marked **Edited**. Your draft is not touched. Sending any message drops all such changes, and if you sent a recalled
message, your draft comes back into the box. The message in the conversation is never changed.

## What counts as a message you sent

The same rule decides the chat's bubbles, the ticks of the send index and this history:

- Included: what you typed, messages sent while Claude was still working, slash commands drawn as your message (such as
  `/rename my name`), and messages made of pictures alone.
- Left out: commands that only do something and leave no message (such as `/clear` or `/usage`), model changes,
  messages from other sessions and notes the app writes for Claude, finished background tasks, and interrupt markers.

## Your draft is kept

A draft is everything in the message box: the text, attached pictures and files, reply and excerpt cards, picked page
elements and the `@@` recipient. Each session has its own.

- It stays when you switch sessions, close and reopen the tab, or restart the IDE.
- Another window showing the same session gets the change within a moment. A window you are typing in is never
  overwritten with older text.
- Another device connected to the same plugin backend, such as a phone over a remote tunnel, sees it too.
- The draft of a session that has not had its first message yet stays in its own window.

The plugin backend keeps drafts under its data folder (`~/.claude-code-gui`), pictures included, and removes a draft
once it is empty.

## Limits

- The history covers the conversation you are in, not your other conversations in the project.
- A recalled message that held a picked page element gets its text back, not the element's chip.
