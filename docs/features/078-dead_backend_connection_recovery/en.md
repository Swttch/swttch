# The IDE now notices a backend that died without saying goodbye

> Language: **English** · [한국어](./ko.md)

## What went wrong

On Windows 11 with a project opened from WSL2, the chat panel could stay on this banner forever.

```
Backend disconnected. Reconnecting...
```

The backend was gone and nothing started a new one. Restarting the IDE was the only way out.

The problem was reported as [#516](https://github.com/Swttch/swttch/issues/516), found while re-checking [#384](https://github.com/Swttch/swttch/issues/384).

## When it happens

Not every time the backend dies. In a normal IDE state the plugin recovers by itself, and that did not change.

We measured it on IntelliJ IDEA 2026.1.2 with a project opened from a WSL2 distro (`networkingMode=mirrored`).

| Situation | Before this change | After this change |
|---|---|---|
| Normal IDE, the whole WSL2 VM is stopped (`wsl --shutdown`) | Recovers in about 28 seconds | Recovers in about 29 seconds |
| Normal IDE, only the backend process is killed | Recovers in about 15 seconds | Not measured again |
| The IDE's "Confirm Exit" dialog is open when the VM is stopped | **Stuck.** 2 of 2 runs, nothing for more than 135 seconds | Recovers in about 41 seconds (1 run) |

Only the last row was broken.

We do not know why an open dialog changes the result. We also do not know whether this is what the reporter of #384 saw on 0.33.1, and we could not reproduce that report in any other situation.

## Why it happened

The IDE keeps one connection open to the backend for its whole life. The plugin learns that the backend died only when the operating system tells it the connection was closed or reset. That is the signal that starts the reconnect attempts, and after five failed attempts the backend is started again.

When that signal never arrives, nothing starts. While the panel was stuck, the IDE still listed its connection to the backend as open, and nothing was listening on the other end any more.

## How it was fixed

The IDE no longer waits for the operating system to tell it.

Every 15 seconds it sends the backend a small ping. The backend's WebSocket server answers a ping on its own, so the backend needed no change.

Two things count as a sign of life: the answer to the ping, and any message from the backend.

After 45 seconds of silence the IDE treats the connection as dead, drops it, and hands it to the same reconnect path a normal close uses. After five failed attempts the backend is started again, exactly as before.

Writing to a dead connection also makes the operating system answer with a reset. In the stuck case above, that was what started the recovery.

Two details keep a healthy connection from being dropped by mistake.

- **Sleep is forgiven.** If the next check arrives much later than it was due, the laptop was asleep and not the backend silent. The silence is not counted against the connection.
- **The limit is three missed rounds.** Being slow to notice a dead backend costs a few seconds of a banner. Dropping a live connection costs a reconnect, and after repeated failures a backend restart. The two are not comparable, so the limit favors the first.

A connection attempt that hangs now also gives up after 5 seconds and counts as a failure, so it moves toward the restart instead of waiting forever.

## What did not change

Normal recovery is untouched. A closed connection still starts the reconnect attempts after 3 seconds, five failures still restart the backend, and exit codes 0 and 75 are handled as before.

The backend, the webview, the settings and the message types are unchanged.

## How it was verified

The decision logic is a small class with a clock that tests can drive by hand.

- Seven tests cover: answers keep the connection alive, the exact limit is still alive, one millisecond past it is dead, a text message counts as alive, a long sleep is forgiven, and silence after the sleep is still caught.
- Switching off the "dead" verdict made exactly the four tests that expect it fail. Switching off the sleep forgiveness made exactly the two tests that protect it fail.
- All 483 Kotlin tests pass.

On the real setup, the fixed plugin kept a healthy connection for 90 seconds without a false "dead" verdict, and recovered the stuck case in about 41 seconds.

## What it does not do

It does not explain the report that started this. We could not reproduce the reporter's recurrence, and this change is not known to fix it.

If you still see "Backend disconnected. Reconnecting..." that does not go away, please open an issue with the steps you took just before it appeared and the file `~/.claude-code-gui/logs/lifecycle.log` from inside WSL.
