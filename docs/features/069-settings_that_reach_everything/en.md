# The settings you already wrote now reach everything

> Language: **English** · [한국어](./ko.md)

## What was wrong

Claude Code lets you put environment variables in `settings.json`:

```json
{
  "env": {
    "HTTPS_PROXY": "http://proxy.example.com:8080",
    "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-..."
  }
}
```

The `claude` CLI reads that file and applies the block before it does anything.
Nothing else on your machine does. A variable written there is not a real
environment variable — no shell exported it, and no other program goes looking.

So this plugin had to carry the values across itself, and it carried a list of
eight names: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, and the same
four in lower case. Anything else you wrote in that block went nowhere.

That list grew twice, both times because someone hit the wall:

- A proxy set only in `settings.json` never reached the usage panel
  ([#181](https://github.com/Swttch/swttch/issues/181)). Four names were added.
- The lower-case spelling of the same variable still did not
  ([#432](https://github.com/Swttch/swttch/pull/432)). Four more were added.
- Voice input failed with `401` for anyone signed in with
  `CLAUDE_CODE_OAUTH_TOKEN` instead of `claude login`
  ([#457](https://github.com/Swttch/swttch/issues/457)). That would have been a
  ninth name.

Three reports, one wall. And separately, the plugin's own requests — the sponsor
licence check, update notices, announcements — ignored your proxy entirely, no
matter which names were on the list.

## What we did

### The list is gone

The `env` block is read whole. Whatever you write in it is applied, by the same
rules `claude` itself applies:

| What you write | What is applied |
| --- | --- |
| `"HTTPS_PROXY": "http://proxy:8080"` | the string, as written |
| `"PORT": 8080` | `"8080"` — numbers become text |
| `"DEBUG": true` | `"true"` — so do true/false |
| `"EMPTY": ""` | an empty value, which is not the same as removing it |
| `"PATHISH": "${HOME}/x"` | the literal `${HOME}/x`, because `claude` does not expand it either |

Both your global `~/.claude/settings.json` and your project's
`.claude/settings.json` are read, along with each `settings.local.json` beside
them, in that order — the later file wins for a name it mentions, and leaves the
others alone.

A value written in a settings file beats one exported in your shell. That is
what `claude` does, and the point is that one file means one thing.

### Voice input accepts the token you already use

If you sign in with `claude setup-token` and keep the token in `settings.json`,
voice input works. It did not before, and the `401` it gave you was not about
your account or your subscription — nothing was reading the token.

Voice input also stops claiming to be available when your saved login has
expired. It used to say "ready", then fail the moment you spoke.

### Your proxy carries the plugin's own traffic

Five things the plugin fetches for itself now go through your proxy: the sponsor
licence check, the plugin update check, announcements, the MCP server registry,
and usage telemetry.

The sponsor licence one matters most. If you sponsor the project from a machine
behind a corporate proxy, the check could not reach us, and the plugin had no
way to know your key was good
([#256](https://github.com/Swttch/swttch/issues/256)).

`NO_PROXY` is respected. Anything pointed at your own machine (`localhost`,
`127.0.0.1`) skips the proxy, since a request that never leaves the machine has
no reason to take a detour through one.

### Every action uses the right project's login

If you point a project at its own Claude data directory with
`CLAUDE_CONFIG_DIR`, every action now uses that project's directory. Before,
several did not — they used whichever project you had opened most recently.

Signing in was one of them. `claude auth login` *writes* your credential, so
signing in from the wrong context saved it in another project's directory, and
you would be signed in while the plugin showed you signed out.

## What you need to do

Update `ccb` to **0.7.3 or newer**. The Voice section of Settings shows the
installed version with an update button beside it.

An older `ccb` cannot read your settings files, so the plugin now refuses to use
one and tells you to update instead of failing in a way that points nowhere.

Nothing else changes. If your settings already work with `claude` in a terminal,
they work here.
