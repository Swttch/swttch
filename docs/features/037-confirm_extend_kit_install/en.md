# When installing the voice input kit said "done" but nothing worked

> Language: **English** · [한국어](./ko.md)
>
> Related: [#298](https://github.com/Swttch/swttch/issues/298)

## The report

A user trying out voice input on v0.27.0 opened
[#298](https://github.com/Swttch/swttch/issues/298). Clicking the microphone
button and installing from settings both ended the same way.

> Both are failing to install (despite it indicating install succeeded). As a
> result I cannot use voice.

Another user soon commented that they were seeing exactly the same thing.

v0.27.1 fixed one cause, and the original reporter confirmed it worked for them.
The second reporter, however, was still stuck after updating — and what they
wrote next turned out to be the key to this fix.

They installed by hand in a terminal and got:

```
added 2 packages in 855ms
```

A success. And still nothing changed on screen. Then, a few minutes later:

> Just an update: I reran the command twice, and it worked the second time :)

**The very same command, run once more, worked.**

## Why "success" wasn't success

We decided whether an install had finished by looking at the command's **exit
code**. If `npm install` returned 0, we called it installed and said so on
screen.

The trouble is that the exit code answers a different question than the one we
actually care about.

An exit code tells you **"did the command run?"**
What matters to the user is **"can I use voice input now?"**

Those two come apart far more often than you would expect, because there is no
single answer to where a global npm package lives.

| Tool | Where packages land |
|------|--------------------|
| volta | `~/.volta/tools/image/packages/…` (its own store) |
| pnpm | `~/Library/pnpm/global/…` |
| yarn | `~/.config/yarn/global/…` |
| npm | the active Node's `lib/node_modules` |

Add the `npm_config_prefix` environment variable and even the npm we picked can
write somewhere else entirely. The command still runs fine, so it still
returns 0.

Install into A while the program looks in B, and the command succeeds while the
feature does not. The screen says "installed". Every chapter of #298 has this
one shape.

## Now we look for it

We changed what counts as done.

**An install is finished when we can actually find the package — not when the
command says so.**

To look, we use the very same resolution voice input uses to load the kit.
Instead of checking "where we installed" and "where we load from" separately and
comparing them, the two collapse into a single question: **can we load it right
now?**

The nice part is that this needs no special case for each row of the table
above. volta, pnpm, `npm_config_prefix` — wherever it landed, **if we can load
it, it worked; if we cannot, it hasn't yet.** That is all it means to the user
anyway.

## If we cannot find it, we try once more

We do not call it a failure straight away, because the reporter told us
something useful — **running the same command a second time worked.**

So when the kit is missing on the first look, we run the install once more and
look again. Running `npm install` on an already-present package does nothing, so
a re-run is safe.

We do **not** retry when the command itself failed. If it could not run at all —
blocked by permissions, say — a second attempt ends identically and only doubles
the wait before the real error reaches you.

If it is still missing after both attempts, we say:

> The installation did not complete. Please try again.

We do not call it a failure, because nothing actually failed. Nor do we explain
our own lookup troubles. It says what happened and what to do about it.

Once the install is confirmed, what the screen shows is handed over to the
**version display** — the same lookup that runs when you click the version
number. Keeping a second notion of "installed" on the install side would only
mean two answers that eventually disagree.

## The message that vanished after 4 seconds

One more thing came along with this fix.

Installing into a location that needs administrator rights, like `/usr/local`,
makes the command fail. That is expected — a program running in the background
cannot ask you for a password.

So we already handed back a command you could copy and run yourself:

```
sudo /usr/local/bin/npm install -g --prefix /usr/local @swttch/extend-kit
```

Except that message **disappeared after 4 seconds**, which was the notification
default.

Four seconds is nowhere near enough to read a multi-line message, find the
command inside it, and retype it into a terminal. The reporter never saw it —
they worked the command out on their own instead. A message you have no time to
read is not a message.

Now an install failure **stays until you close it**, with a close button of its
own, and the command keeps its line breaks so it stays on one line.

The "installation did not complete" message travels the same road, since it is
the only thing telling you to press the button again.

## Summary

- Installation is confirmed by **finding the package**, not by an exit code.
- We look for it the **same way** voice input loads the kit.
- If the first look misses, we **install once more**. Not when the command
  itself failed.
- If both attempts miss, we ask you to try again.
- Install failure messages **stay put until you have read and used them**.
