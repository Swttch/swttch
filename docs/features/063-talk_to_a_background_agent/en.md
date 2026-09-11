# You can talk to a background agent

> Language: **English** · [한국어](./ko.md)
>
> Related: [#425](https://github.com/Swttch/swttch/issues/425)

## Two kinds of agent

The Background tasks panel holds things of different natures. This document
keeps two of them apart by name.

| Name | What it is |
|---|---|
| **workflow agent** | One of the several agents a single workflow runs. Picked from the tabs on the left of the modal |
| **local agent** | A single agent launched into the background with the `Agent` tool. It IS a task in its own right |

Both names are the CLI's own (`workflow_agent`, `local_agent`).

## What changed

### You can see what an agent was asked and what it gave back

A workflow agent had a header saying **what it was asked and what it
answered**. A local agent had the transcript and nothing else. The same kind of
thing was being shown two different amounts.

![A local agent's modal. Under the title, a status line reads completed · agent · tokens · duration · general-purpose, and below it two rows labelled Prompt and Result](./assets/agent-header.png)

They are **one component** now. Only where the values are read from differs;
the shape cannot drift apart.

`Prompt` is what the agent was told to do, `Result` what it returned. Neither is
easy to find by eye in the transcript: it auto-scrolls to the end, so the
opening instruction has long gone by, and the returned value is a different
thing from whatever the agent happened to say last.

Which kind of agent ran (`general-purpose` and the like) sits to the right of
the duration.

### You can send it a message

An agent could be watched and stopped but not spoken to — though the CLI had
been saying all along that it could be. Its completion notice carries this
sentence:

> the user can send it another message and resume it

![An input box sits under the agent's transcript, with a send button at its bottom right](./assets/agent-composer.png)

The box sits **directly under that agent's transcript** rather than in the main
chat, because the message is addressed to this agent and the reply comes back in
this transcript.

**Workflow agents can be written to as well**, and that is something only the
GUI can offer. The CLI never tells the model a workflow agent's address; we
receive it on the progress stream.

The box is built from the **same frame** as the main composer. The border, the
focus ring, the divider and the bottom bar are defined in one place and both
sides use it. So Enter to send and Shift+Enter for a newline, an editor that
does not lose a keystroke mid-composition, and a box that grows with the text
all behave identically in both.

There is **no** attachment or slash-command button — absent rather than
disabled. The channel that carries a message to an agent takes a plain string,
so an attachment has nowhere to go, and a slash command addresses the session
rather than the agent standing in front of you.

### Sending shows something is happening, and you can stop it

![The button at the bottom right of the box has become a stop square instead of a send arrow](./assets/stop-button.png)

The send button becomes a stop button **the instant you send**, without waiting
for the CLI to wake the agent and report back. A send button standing there in
the meantime reads as if nothing had happened.

Stop stops **only the agent you are looking at**. Stopping a workflow agent does
not take the whole workflow down with it.

With the cursor in the box, `Esc` stops the agent instead of closing the modal.
When the agent is not working, `Esc` closes the modal as before.

### The box locks when the agent can no longer be reached

An agent lives in the CLI session that started it. Once that session ends — the
process restarts and a new one picks the conversation up — the earlier agent
cannot be woken again.

![The input box is greyed out and locked, with a red line beneath it reading that the agent's session has ended and it can no longer be reached](./assets/unreachable.png)

The box locks and says why, underneath, in red.

**This cannot be known in advance.** An unreachable agent looks exactly like a
reachable one and there is nothing to ask. So it locks after one message has
been sent and refused. The box stays in place rather than disappearing, because
the transcript above is still worth reading and a control that vanishes leaves
you wondering whether it was ever there.

### A resumed agent does not appear twice

Sending a message wakes an agent, and the CLI announces that as though it were a
**new task**. Taken at face value, the panel grows a second row for one agent —
one sitting in "finished" and the other in "running" at the same time.

The CLI warns about this too:

> the same task-id may notify more than once

Something arriving again under the same task number is treated as the same task.
The original row goes back from "finished" to "running", and the opening
instruction and every message sent since stack up in order.

## Fixed along the way

Found while doing the above. Not part of the original issue, but they surfaced
on the same screen.

### Reopening a session showed no background tasks at all

The biggest one. Reopening a session left the Background tasks panel **empty** —
not one task, workflows included.

Reconstruction was being abandoned on its first step by an error that was logged
and never shown. The server log held eight of them.

### Commands that were never backgrounded piled up in the panel

A plain `ls` put a row in the Background tasks list and ticked the running
badge. That panel is for **work happening out of sight**, and a command whose
output you just read on screen was being filed there.

The CLI says which is which every time, and we were not reading it.

A command sent to the background mid-run does belong in the list. The CLI
reports that transition too — and that notice was being discarded entirely.

### Tasks that had finished still looked like they were running

The CLI has a channel that states outright how a task ended, and it was not being
read. A workaround had grown up instead, scanning the output file for traces of
an ending. It is now taken as reported.

A stopped task also showed its status on screen as `killed`. Fixed.

## Remaining limits

**A message to a running agent may not be read straight away.** It is accepted,
but delivered when the agent next calls a tool. During a short one-shot task, it
may finish without an opportunity to read it. An agent that has already finished
is woken by the message, so it is handled for certain.

**Delivery goes through the model.** The channel is the model's own tool, and
the CLI gives its user no direct way to call it either. No undocumented route was
used to get around that.

**An unreachable agent can only be discovered by trying.** As described above.
