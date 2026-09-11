# Usage stats work behind a proxy

> Language: **English** · [한국어](./ko.md)

## What was wrong

If your machine reaches the internet only through a proxy, the usage panel
could not load. Chat worked. `/usage` worked. Only the battery reading and the
account list sat there failing, and the error said nothing about a proxy.

That split is the clue to what was happening. Chat goes out through the
`claude` CLI, which reads your `settings.json` and honors the proxy you
configured there. The usage numbers do not come from `claude` — they come from
`ccb`, a small companion CLI installed separately on your machine, because
reading your Claude Code login is something a JetBrains plugin is not allowed
to do.

`ccb` is not the Claude CLI and never read your `settings.json`. So a proxy
configured there was invisible to it, and every usage query went out directly,
into a network that refuses direct connections.

Reported in [#181](https://github.com/Swttch/swttch/issues/181), with the fix
contributed by the person who hit it.

## What we did

The proxy you configure for Claude Code now reaches the usage queries too.

Nothing new to set up: the settings that already make `claude` work are the
settings this reads.

```json
{
  "env": {
    "HTTPS_PROXY": "http://user:password@proxy.example.com:8080"
  }
}
```

`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and `NO_PROXY` are all read, in
upper- or lowercase. A proxy exported in your shell keeps working as before.

### Per-project proxies

If a project's `.claude/settings.json` sets a different proxy than your global
one, the project's wins — the same precedence `claude` itself uses.

Switching to a project that configures no proxy drops back to whatever your
shell exports, rather than leaving the previous project's proxy in place.

### SSH tunnels

An `ssh -D` tunnel is a SOCKS proxy, not an HTTP one, and it is now supported
alongside HTTP proxies:

```json
{
  "env": {
    "ALL_PROXY": "socks5://127.0.0.1:1080"
  }
}
```

Dictation goes through the same proxy. It was blocked in exactly the same way
and for the same reason.

## The companion updates itself

The proxy support had to be built in `ccb` as well, not only here, so this
needs **`ccb` 0.6.0 or newer**. Earlier versions accept the proxy setting but
do not act on it.

You do not have to do anything about that. The backend checks the companion
for a newer release each time it starts and updates it in the background, so
an existing install moves to 0.6.0 on its own. The installed version is shown
under **Settings → General → Voice input** if you want to confirm it.

## How to tell it is working

A proxy is invisible in a URL, so a failure used to look like a plain network
error. Now, when a request went through a proxy and could not get out, the
message says so and names the variables involved, instead of leaving you to
guess whether the proxy, your token, or the network was at fault.
