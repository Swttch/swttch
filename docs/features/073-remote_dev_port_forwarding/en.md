# You can now use the plugin against a Remote Development environment

> Language: **English** · [한국어](./ko.md)

This is for people who connect over SSH through JetBrains Remote development and
work on a development environment that lives on a remote server, reaching it from
a client.

Before, the backend never connected and all you got was the banner.

Now you can drive Claude Code running inside the remote server from the plugin.

## What has to be installed

These have to be present **on the remote development server**:

- **`claude` has to be installed, and logged in.**
- **The extend kit has to be installed.** One button click finishes the install.
  Things still work without it, but the UI cannot handle accounts, usage or voice.

The extend kit's install button is at the top right of the **Voice input** section
in **Settings → General**. It reads **Install**, and pressing it completes the
install in place. When the kit is already there the same spot shows its version
number, and an **Update** button when a newer one exists.

Both belong on the **remote development server**, not on the machine in front of
you. The plugin's backend runs on the remote server, and it is that backend which
runs `claude` and the kit.

## What was wrong

The chat UI is a web page served by a Node backend that the plugin starts for you.
On one machine that is invisible — the page and the server share a `localhost`.

Under JetBrains Remote Development they do not share one. The backend runs on the
remote host and binds `127.0.0.1:<port>` there. The webview runs inside JetBrains
Client, on your own machine, where `localhost` is *your* loopback — and nothing is
listening on it. The panel would render its shell and then sit on

> Backend disconnected. Reconnecting…

forever ([#292](https://github.com/Swttch/swttch/issues/292)).

The only way through was to build an SSH tunnel by hand:

```
ssh -N -L <port>:127.0.0.1:<port> you@remote-host
```

and the port is assigned by the OS at every backend start, so that command was
dead again on the next restart. Worse, the port is part of the webview URL's
origin, and `localStorage` is partitioned per origin — so a new port also orphaned
the stored auth token, and the pairing code that would replace it is single-use.

## What changed

Nothing, for you. Open the panel in a Remote Development session and it connects.

The plugin now asks the IDE to forward the port. When the backend reports the port
it bound, `PerClientPortForwardingManager.forwardPort()` publishes it to every
connected client and reports back the port assigned on the client's side, and that
is the port the webview URL uses. The IDE's own channel carries the traffic, so
there is no tunnel to create and nothing to recreate when the backend restarts.

It is also per project: two remote projects run two backends on two ports, and each
one is forwarded separately.

To confirm it is working, open the **Port Forwarding** view on your own machine.
The forwarded port is labelled **Claude Code**. The remote host's IDE log carries
the matching line:

```
Backend port is reachable from the client on 46655
```

## What it does not change

**A local IDE is untouched.** The manager list resolves to
`getServices(..., ClientKind.REMOTE)`, which is empty when there are no remote
clients — so in a monolith IDE the lookup ends immediately, no forwarding happens,
and the webview gets the backend's own port exactly as before.

**Failure is never fatal.** Anything unexpected — the API missing, the client not
binding its end in time, a call throwing — falls back to the host port. That is
correct locally and no worse than the previous behaviour anywhere else.

One limit is worth knowing. **If the IDE declines to forward the port, the plugin
does not override it.** It asks once each time the panel opens, and falls back to
the unforwarded port when the answer is no. Nothing in the plugin's own settings
changes that.

## Installing on the client does not help

JetBrains offers to install a plugin on both halves, and doing so can look like a
fix: the chat connects and the tool window icons appear.

**It is not a fix.** The client half then starts its own backend, on your machine,
and that backend runs `claude` against a local scaffold folder instead of the
project you are editing. Measured on PhpStorm 2026.2.3, the working directory
resolved to `~/Library/Application Support/JetBrains/PhpStorm2026.2/projects/<hash>`
— not the remote project.

A chat that looks connected while reading the wrong machine's files is worse than
one that says it is disconnected. So the client half stands down: it starts no
backend, registers no tool windows, restores no sessions and shows no status
widget. The remote half is unaffected, and its menu actions still reach you.

## Notes for maintainers

The forwarding API is reached by **reflection**, on purpose. It lives in the
Remote Development plugin, which is not bundled in IntelliJ IDEA Community — the
platform this project compiles against — so a compile-time dependency would fail
the build rather than degrade the feature. It is also `@ApiStatus.Experimental`.
CONTRIBUTING.md asks for reflection in exactly this situation.

Two behaviours of that API are worth knowing before changing this code:

- `forwardPort()` asserts it runs on the **EDT**. The panel calls it from a
  coroutine, so only the API calls are dispatched there.
- the client-side port is assigned **asynchronously**, and the wait for it must
  *not* hold the EDT — seconds on the EDT would freeze the IDE, which would be a
  worse bug than the one being fixed.
