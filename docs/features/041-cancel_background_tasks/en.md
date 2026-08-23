# Background tasks can actually be stopped now

Pressing the `✕` next to `running` in the Background tasks panel **cancels** that
task. It used to only hide it from the list, and the task kept going behind it.

And `Escape` now stops **only what is answering on screen.**
It leaves background tasks alone — the same as the CLI.

## What changed

| | Before | Now |
| --- | --- | --- |
| `✕` on a running task | Only hid it from the list (the task kept running) | Cancels the task |
| `✕` on a finished task | Hid it from the list | Unchanged |
| `Escape` | Stopped the answer + marked every background task `stopped` | Stops the answer only |
| `Escape` ×3 (after the answer stopped) | — | Stops every background task (after confirming) |

## Why it changed

After the report came in we opened the code, and the `✕` turned out to be nothing
more than removing one id from the on-screen list. No request went to the backend.

`Escape` was much the same. It sent the interrupt to the CLI and, at the same
time, painted every background task in that session as `stopped`. But painting was
all it did — **the tasks kept running.** The screen and the truth had drifted
apart.

We measured it, and that is what happens. When you press `Escape` the CLI ends
the turn, but nothing reaches the background tasks and they carry on. So
`stopped` was not true.

Now `Escape` stops the answer only. If a background task is still showing
`running`, it really is running.

## Stopping all of them with three presses

Since one `Escape` no longer stops the background ones, there had to be a
separate way to stop them all.

With the answer already stopped, press `Escape` three times quickly: a
confirmation appears, and confirming cancels every running task.

The count starts **after the answer has stopped.**
So pressing it four times mid-answer means the first press stops the answer and
the remaining three bring up the confirmation. If nothing is running, nothing
happens.

We did not use keys like `Ctrl+F` or `Ctrl+T`.
Those keys do handle background tasks in the CLI, but inside an IDE `Ctrl+F` is
Find and `Ctrl+T` is Update project from VCS. If we claim them, we swallow the
IDE's own shortcuts. We have been through exactly that with `F12`.

## How a cancel gets through

First we send the cancel request straight to the CLI. It stops immediately.

If that cannot happen — we do not know the task id, or the request never got
through — we ask the model to stop it for us instead. That message does not
appear in the conversation.

There is a reason the second route is kept. The first one is Claude CLI's own,
so it does not carry over to another CLI as-is. The second needs nothing beyond
"there is a model and there is a tool that stops things". When another CLI is
wired up later, the second route is what remains.
