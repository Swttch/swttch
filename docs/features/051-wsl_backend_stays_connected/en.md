# The backend no longer drops every ten seconds on WSL2

> Language: **English** · [한국어](./ko.md)

## What went wrong

Opening a project that lives inside WSL2 from Windows 11 left the chat stuck in a loop.

```
Backend disconnected. Reconnecting...
```

It connected. It worked for about ten seconds. It disconnected. It came back. Ten seconds later it dropped again.

The IDE never closed during any of this, and `claude` in the terminal kept working fine.

Two reporters hit the same thing on separate machines, and one of them went back to VS Code to get work done.

The problem was reported as [#384](https://github.com/Swttch/swttch/issues/384).

Plugin versions 0.29.3 and 0.29.4 are affected.

## Why it happened

The backend has a guard that **ends it when the host that launched it goes away**.

That guard arrived in [#360](https://github.com/Swttch/swttch/pull/360). A backend that outlived its IDE kept holding the port and the files a newly installed version needed, and closing the IDE did not clear it, so reporters had to reboot Windows ([#308](https://github.com/Swttch/swttch/issues/308)).

The guard took the IDE's process id and asked, every ten seconds, whether it was still alive.

But **on WSL2 the IDE and the backend live in different worlds.**

PhpStorm is a Windows process. The backend runs inside the WSL2 Linux distro.

Asking Linux about a Windows process id gets you **no such process**. Not because it died, but because that number was never one Linux could see in the first place.

The backend read that answer as "the host died".

So exactly ten seconds after connecting, on its very first check, it declared a perfectly healthy PhpStorm dead and shut itself down.

A reporter's log shows the sequence verbatim.

```
[node-backend] Host process 14056 died — shutting down
[node-backend] parent-death received, shutting down...
RPC WebSocket closed: 1006
```

The same reporter then asked Windows directly from inside WSL2 and confirmed that pid 14056 was **alive the whole time**.

## How it was fixed

Two changes, made together.

### Not being able to see something is not the same as it being dead

The backend exists because the host started it moments ago. So **the host cannot already be dead at the instant the backend starts up.**

If "no such process" comes back at that instant, it does not mean death. It means the id is **not one we can observe from here**.

The backend now checks once when it starts watching, and when the id turns out to be unobservable it **stops asking by id at all**.

Rather than give a wrong answer to a question it cannot answer, it declines to ask.

On Windows without WSL the IDE and the backend share the same world, so this check passes and the watch arms exactly as it did before.

### An IDE host is watched by its connection instead

Dropping the id check would leave nobody watching the host on WSL2, which is how #308 happens.

So an IDE host is now watched by **its connection rather than its id**.

An IDE holds one dedicated connection to the backend open for its entire life. If the IDE goes away for any reason, the operating system closes that connection.

This approach has neither of the earlier problems. It does not require the two processes to share a world, and nothing sitting between them can hide the host.

A closed connection does not trigger an immediate shutdown, because restarting an IDE closes the connection and opens a new one.

The backend **waits fifteen seconds**, and only if nothing reconnects in that window does it treat the host as gone.

## What did not change

The rule [#360](https://github.com/Swttch/swttch/pull/360) established still holds.

**Whoever launched the backend ends it**, no matter who else is attached over a browser or a tunnel.

Chat connections are separate from the IDE's dedicated connection, so an open chat window does not change the verdict.

A backend launched from the terminal with `ccg` has no IDE connection at all and behaves exactly as before.

Setups using a version manager (Volta, nvm, fnm) also behave exactly as before. The handling [#360](https://github.com/Swttch/swttch/pull/360) added for that case stays in force on Windows.

## How it was verified

All 1762 backend tests pass.

A test reproducing this specific problem was added, and **disabling the fix again makes exactly that test fail**. The passing result was checked to be meaningful before it was trusted.
