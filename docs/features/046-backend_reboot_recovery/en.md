# Bringing the backend back without a reboot

Sometimes the plugin came up showing `Node.js backend failed to start`, and pressing `Retry` just brought the same screen back.

Closing and reopening the IDE did not help either. In the end only **rebooting Windows** cleared it.

## Why it happened

The plugin unpacks the files it needs into a per-version folder once, and uses a single lock file to keep two of those unpacks from overlapping.

But the wait for that lock had no time limit.

If a backend process from an earlier run was still alive and holding the lock, the starting side waited indefinitely and fell through to the screen above after 30 seconds.

On Windows a file held open by a running process cannot be deleted or overwritten, and that process survives closing the IDE. That is why nothing short of a reboot worked.

## What changed

**First, the lock file is gone entirely.**

Rather than shortening the wait, the lock itself was removed.

It was guarding exactly one thing: the waste of unpacking the same files twice when two IDEs are open.
It was never what kept the result intact — unpacking into a temp folder, verifying it, and then moving the whole thing into place already does that.

Saving one duplicate unpack is not worth pushing anyone into rebooting their machine.

A lock file left behind by an older version is cleaned up on the next run.

**Second, closing the IDE now shuts the backend down with it.**

It used to stay running, so that a browser or tunnel client could keep working past the IDE.

But a backend left behind that way has no IDE to stop it from either — and that is what this whole problem was made of.

Now whatever started the backend also ends it: the IDE when you started it from the IDE, the terminal when you started it there.

**Keeping a tunnel session going after closing the IDE no longer works.** In exchange, what runs on your machine is something you can reliably stop.

**Third, there is now a way out when you do get stuck.**

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
