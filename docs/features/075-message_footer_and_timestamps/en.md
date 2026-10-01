# Message footer: copy, fork, and when it was sent

> Language: **English** · [한국어](./ko.md)

## Scrolling back used to tell you what, never when

A long session is a record of a day's work, sometimes several days'. Scroll up
and every prompt and reply is there, but nothing says when any of it happened.
"Was that before or after lunch?" "Did I ask for this yesterday or this
morning?" The chat could not answer, and the session file it reads from could,
because the CLI stamps every entry it writes with the time.

That was the request in
[#498](https://github.com/Swttch/swttch/issues/498): show the time a message
was sent, so you can scroll back through the history and see exactly when
things happened.

The answer is a small line under each message, the **message footer**, which
carries the time along with the two things you most often want to do with a
message: copy it, and branch off from it.

![Two messages in the chat. Under the user's "say ok" bubble, a line with a copy icon, a fork icon and "September 15 (Tue) 11:11 PM". Under the assistant's reply "ok", a line with a copy icon and the same time.](./assets/message-footers.png)

## Where it appears

| Under | Copy | Fork | Time |
| --- | --- | --- | --- |
| A message you sent | ✓ | ✓ | ✓ |
| A stretch of the assistant's reply text | ✓ | | ✓ |
| A tool card (`Bash`, `Read`, an edit, …) | | | on the bullet, see below |

**It shows when you point at the message.** Move the pointer over a message
and its footer appears; move away and it goes. A long transcript is not turned
into a column of buttons.

**The message the chat ends on shows its footer all the time.** Whatever was
said last, your prompt or the reply, keeps its copy button and time in view
without a hover, so the latest exchange is always one click from the
clipboard.

## The time

The time comes from the session file itself: the moment the CLI recorded the
entry. It is shown in your computer's time zone, and it is written in two ways
depending on how long ago it was.

| How long ago | Shown as |
| --- | --- |
| Less than 7 days | `(Thursday) 12:13 PM` |
| 7 days or more | `June 27 (Mon) 5:08 PM` |

Within a week the weekday is enough to place a message. After that a weekday
repeats, so the date comes first.

The words follow **Settings → General → Interface Language**, in every language
the interface is translated into. In Korean, for example, the same two times
read `(목요일) 오후 12:13` and `6월 27일 (월) 오후 5:08`.

**The year is not shown.** A message from June 27 of last year and one from
June 27 of this year read the same. Sessions are rarely that old, and the
shorter line reads better the other 99% of the time.

## Copy

The copy button puts the message's own text on your clipboard and says so with
a short notice. If the clipboard refuses (it
happens when the window loses focus mid-click), you get a notice saying the
copy failed, so you never paste something else believing you have the message.

- **Under your message**, it copies what you typed.
- **Under the reply**, it copies that stretch of the reply as Markdown, the
  same text the chat formats on screen. A reply that runs a few tools splits
  into several stretches of text, and each has its own footer and copies only
  itself.

## Fork

The fork button under your message opens a **new session that branches off at
that message**: everything before it, with that message waiting in the input
box. The session you were in stays exactly as it is.

Because it moves you into a different session, it asks first.

![A dialog titled "Fork the conversation?" reading "Opens a new session that branches off at this message. The current session stays as it is.", with "Cancel" and "Fork" buttons.](./assets/fork-confirm.png)

**Fork** goes ahead. **Cancel**, Escape, or a click outside the dialog leaves
everything as it was.

This is the same action as **Fork conversation from here** in the ⋮ menu at the
top-right corner of your message. The menu entry does not ask, since opening
the menu is already a deliberate step; the footer button sits one pointer move
away from copy, which is too easy to press by accident.

The fork button is missing in two cases:

- **Under a message that has just been sent.** Until the CLI has written it to
  the session file there is nothing to branch from. It appears once the
  message is recorded.
- **Under the assistant's reply.** Forking branches off before a message you
  sent and carries that message into the new session. A reply has no prompt to
  carry, and branching *after* a reply is not something the app can do yet.

## The bullet on tool cards

Tool cards have no footer. Instead, point at the small dot to the left of the
card and its time appears in a tooltip, in the same format as above. The same
works on the dot beside each stretch of reply text.

![The tool card "Bash Record timer start time" with its command and output. A small tooltip above its dot reads "September 16 (Wed) 2:10 AM".](./assets/bullet-time-tooltip.png)

## While a message is pinned to the top

As you scroll through a long reply, the message you sent stays pinned to the
top of the chat and shrinks out of the way. While it is folded like that, its
footer is gone, even under the pointer: the pinned message is a signpost for
the reply below it, not the thing you are reading.

Click the pinned message to expand it and read it in full, and the footer
comes back with it, shown without a hover. Click again to fold it, and the
footer goes again.

## Worth knowing

- **Nothing appears under a reply that is still arriving.** Copying it then
  would copy half a reply, and its time is not the recorded one yet. The footer
  appears when the reply is complete.
- **"The chat ends on" counts only your messages and the assistant's.** After a
  reply, the CLI also writes bookkeeping entries to the session file that draw
  little or nothing on screen. They are skipped, so the reply you are looking
  at keeps its footer.
- **If the last thing in a reply is a tool card**, that card is where the chat
  ends, and the text above it shows its footer only on hover.
- **With Settings → Appearance → Chat → Hide tool calls turned on**, a reply
  that ends on a hidden tool card still counts as ending there. The text you
  see last then shows its footer on hover only.
- **Inside an agent's transcript** (the window that opens from the background
  tasks panel), footers always wait for a hover; nothing there is "the end of
  the chat".
- **The footer is display only.** Nothing is added to or changed in the session
  file.
