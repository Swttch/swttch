# Go back to any message: fork the conversation, rewind the code

> Language: **English** · [한국어](./ko.md)

## What was missing

A conversation only went forward.

If Claude took a wrong turn twenty minutes ago, there was nothing to do about
it. You could not try the same question a different way without losing
everything that came after, and you could not put the files back the way they
were before an edit you did not want.

The terminal had both. Pressing Escape twice in `claude` opens a list of your
messages and offers to restore the conversation, the code, or both. That is one
of the things this plugin exists to bring to the IDE, and it was not here.

## What we did

Every message you send now carries a **⋮ menu at its top-right corner**, and it
holds three new entries.

### Fork conversation from here

Opens a **new session that shares everything before this message** and nothing
after it.

The message you forked from is put back in the composer, so you can reword the
question and send it down a different path. Your original conversation is left
exactly as it was — nothing is deleted, and you can go back to it from the
session list at any time.

This is for "that was the wrong question." You keep the context you built up and
try again from the last point where things were still going well.

### Rewind code to here

Puts **the files back the way they were** when you sent that message.

Claude takes a copy of a file before it edits it, and this restores from those
copies. Your conversation is untouched: the messages stay where they are, and
only what is on disk changes.

This is for "the answer was fine, the edits were not."

### Fork conversation and rewind code

Both, in that order. The files are restored first, and the new session opens only
if that worked — so you are never left in a fresh branch looking at code that was
never put back.

## The setting behind it

Rewinding needs those file copies to exist, and taking them is a Claude Code
feature called **file checkpointing**. It is on by default.

You will now find it in **Settings → General → File checkpointing**. It is
Claude's own setting rather than one of ours, so turning it off here turns it off
for `claude` in your terminal too, and vice versa.

If you turn it off, the two rewind entries stop appearing. Forking still works —
it only needs the conversation, which is always recorded.

## Two things worth knowing

**The entries appear as soon as the reply finishes.** While one is still
streaming they are not there yet: the message on screen is the copy the plugin is
holding, and Claude has not written its own record of it. Both actions have to
name that record, so the menu waits for it rather than showing buttons that would
fail. The wait ends with the reply, not when you reopen the session.

**Conversations from before this release cannot have their code rewound.** The
file copies are taken as edits happen, so a session recorded before checkpointing
was running for the plugin has nothing to restore from. Those messages simply do
not show the rewind entries. Forking works on them normally.

## Under the hood

Rewinding is the official CLI doing the work:

```
claude --resume <session> --rewind-files <message>
```

Forking is the plugin copying the conversation into a new file, up to the point
you branched at. The lines are moved across untouched, so the messages keep their
original identities and the session you branched from is left byte-for-byte
alone.

The CLI has a fork option too, and we did not use it. It creates a session
together with its first message, so forking through it means inventing a message
you never sent. Built that way, every branch opened with a line you had not
written and a reply to it sitting at the top, and each fork took about ten
seconds. Now it opens immediately and the branch reads exactly like the
conversation it came from.

The reasoning is recorded in the
[exception note](../../principle-exceptions/356-rewind-and-fork-hidden-cli-flags.md).

Requested in [#356](https://github.com/Swttch/swttch/issues/356).
