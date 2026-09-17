# Know which credential failed

> Language: **English** · [한국어](./ko.md)

## What was wrong

You are signed in. You have been signed in all day. And the chat answers with
this:

```
● Failed to authenticate. API Error: 401 API key is invalid.
```

Which key? You did not give it a key. You logged in.

That was the whole problem. The line names a failure and a status code, and
says nothing about **which credential was offered**, so the only reading
available to you is "the plugin is broken, because I am obviously
authenticated". That is exactly how it was reported in
[#446](https://github.com/Swttch/swttch/issues/446), by someone whose CLI
worked perfectly in a terminal a moment earlier.

The credential in that report was an `ANTHROPIC_API_KEY` sitting in the
environment the IDE had inherited. The CLI prefers an API key over a stored
login, so it used the key. The key was no longer valid. The server said 401.
Everything behaved exactly as designed, and none of it was visible.

## What you see now

When a turn fails to authenticate, the failure line is followed by a notice
naming the credential the CLI actually used.

![A chat showing the red failure line "Failed to authenticate. API Error: 401 API key is invalid." with a Re-Sign button, and directly beneath it a yellow notice reading "Authenticated with ANTHROPIC_API_KEY, not your Claude login" and "The server rejected that credential. Remove ANTHROPIC_API_KEY from the environment your IDE inherits and restart the IDE to use your login instead."](./assets/credential-source-notice.png)

The name in that notice is not a guess about your machine. The CLI reports it
on startup, in the `apiKeySource` field of its `system/init` event, and the
notice repeats what the CLI said. If the CLI is wrong about it, so are we, and
you can check it yourself by running `claude` in a terminal with
`--output-format stream-json --verbose` and reading the first line.

## What to do when you see it

The notice means an API key won over your login. Two situations, two answers.

**You did not mean to use that key.** Find where the variable is set and remove
it, then restart the IDE so it stops inheriting the old value. The IDE
inherits its environment at launch, which is why a change in your shell does
not reach an IDE that is already running.

| Where you are | Where the variable usually lives |
| --- | --- |
| macOS, launched from Spotlight/Dock | `~/.zprofile`, `~/.zshenv`, or `launchctl setenv` |
| macOS/Linux, launched from a terminal | `~/.zshrc`, `~/.bashrc`, `~/.profile` |
| Linux desktop session | `/etc/environment`, `~/.profile`, `~/.config/environment.d/*.conf` |
| Windows | `setx`, or System Properties → Environment Variables |

`claude` itself also reads `env` blocks in `~/.claude/settings.json` and
`~/.claude/settings.local.json`, so check both files if the variable is not in
your shell.

**You did mean to use that key, and it stopped working.** Then the key itself
is the problem: it was revoked, rotated, or belongs to an organization you no
longer have access to. Replace it with a current one. API keys do not expire
on a timer, so a key that worked last week and fails today was changed on the
server side, not by time passing.

## When the notice does not appear

It is deliberately quiet in three cases, because in each one it would be adding
noise rather than an answer.

| Case | Why it stays silent |
| --- | --- |
| The CLI used your stored login (`apiKeySource` is `none`) | That is what you already assume. Naming it tells you nothing you did not know, and the failure is about the login itself — the `Re-Sign` button next to the line is the action that helps. |
| No `system/init` has arrived yet | There is no reported source to name. |
| The failure has been resolved since | An older failure further up the transcript stops advising you to remove a variable you already removed. A successful auth check made *after* that entry is what marks it resolved. |

## Also fixed in the same report

**The spinner that never stopped.** The reporter's first complaint was not the
401 at all. It was that the plugin sat "stuck forever on claude's weird verbs
running without producing any result", with the 401 as something that happened
only occasionally. Those are two different failures.

A turn ends when the CLI says so. If the CLI dies before saying anything, the
backend says it instead. If the backend dies too, nobody is left to say it —
and the animation kept running until the view was reloaded, because every
signal that ends a turn travels over the same connection that just went away.

Both gaps are closed. The animation now stops when the CLI process dies
mid-turn, and when the connection to the backend drops.

Losing the connection does not end the turn immediately, because connections
drop for a second and come back on their own often enough that reacting at once
would kill turns that were perfectly fine. Instead the animation starts counting
down, and you see the seconds next to it:

```
✻ Brewing... (7s)
```

If the connection returns before the count runs out, the countdown disappears
and the turn carries on as if nothing happened. If it does not, the turn ends
the same way a finished turn does.

The banner at the top of the window still appears the instant the connection
drops. That banner is describing the connection, which is gone right now; the
animation is describing your turn, which usually survives a blink.

**A path with a trailing space.** The reporter also tried to work around the
failure by pointing the plugin at their CLI by hand, in Settings → CLI Path. The path they pasted carried a trailing
space, and `spawn` treats a trailing space as part of the filename:

```
spawn /home/u/.local/bin/claude  ENOENT
```

So a path that was plainly correct produced "not found". Path settings are now
trimmed both when saved and when used — the second half matters, because
shipping a fix does not rewrite a settings file that already holds the space.
This covers **CLI Path**, **Node Path**, **Terminal App**, **Open Files With**,
and the path inside a custom file opener. The argument template of a custom
opener is left exactly as typed, since spacing in a command line is meaningful
and is not ours to edit.

## Limits

**We cannot tell you which file sets the variable.** We can only report what
the CLI tells us it used. Reading your shell startup files to find out where a
variable came from is not something the plugin does, and guessing would be
worse than saying nothing — the table above is the honest version of that
answer.

**The notice describes the moment the CLI started, not the moment it failed.**
`apiKeySource` comes from startup. In practice the two agree, because the CLI
resolves its credential once per process, but if you change the environment
mid-session the notice still names what the running process picked up.

**Removing the variable needs an IDE restart, not just a new terminal.** A
process inherits its environment when it starts. This is an operating-system
rule rather than something we can work around.
