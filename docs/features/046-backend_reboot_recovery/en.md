# Bringing the backend back without a reboot

Sometimes the plugin came up showing `Node.js backend failed to start`, and pressing `Retry` just brought the same screen back.

Closing and reopening the IDE did not help either. In the end only **rebooting Windows** cleared it.

## Why it happened

The plugin unpacks the files it needs into a per-version folder once, and uses a single lock file to keep two of those unpacks from overlapping.

But the wait for that lock had no time limit.

If a backend process from an earlier run was still alive and holding the lock, the starting side waited indefinitely and fell through to the screen above after 30 seconds.

On Windows a file held open by a running process cannot be deleted or overwritten, and that process survives closing the IDE. That is why nothing short of a reboot worked.

## What changed

**First, the lock is no longer waited on forever.**

If the lock cannot be taken within a set time, the plugin gives up on it and carries on. Files that are already unpacked and intact are used as they are; otherwise it unpacks somewhere else and runs from there.

The lock only exists to avoid doing the same work twice — it is not something the plugin cannot run without, so failing to take it must not block startup.

**Second, there is now a way out when you do get stuck.**

When a leftover backend is detected, the error screen adds a line explaining it and a **`Reboot plugin backend`** button appears next to `Retry`.

If nothing is left over, the button does not appear. The screen you are used to stays as it was.

## What the button does

It stops the leftover process, confirms it is really gone, and then starts the backend again.

**Confirming first is the part that matters.** Starting a new backend while the old one still holds the port just makes the two collide, which reproduces the same failure.

So if the cleanup fails, no restart is attempted and the screen tells you what is still there. That case usually means the process runs as a different user or security software is blocking it.

## Worth knowing

Only a process holding **a port this IDE actually used** is ever targeted.

The plugin does not guess a default port and kill whatever answers on it, since that could stop an unrelated program. For the same reason the IDE's own process is never a target.

([#308](https://github.com/Swttch/swttch/issues/308))
