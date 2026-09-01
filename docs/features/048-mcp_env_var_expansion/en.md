# The `${VAR}` in your MCP config now resolves to the real value

> Language: **English** · [한국어](./ko.md)

## What was wrong

A `.mcp.json` is meant to be shared by a team, so it gets committed. That means a password or
a connection string cannot go in it directly, and a placeholder goes in instead.

```json
{
  "mcpServers": {
    "postgres-dev": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "DATABASE_URI", "crystaldba/postgres-mcp:latest"],
      "env": { "DATABASE_URI": "${NEXUS_MCP_DB_URI}" }
    }
  }
}
```

The real value lives in `.claude/settings.local.json`, which is not committed.

Run `claude` in a terminal and this works. **Open the same project in the panel and the server
received the literal text `${NEXUS_MCP_DB_URI}` as its connection string.**

The worse part was the silence. A server handed a value like that does not necessarily fall over:
many log a warning to their own output and start anyway. The panel showed a green **Connected**
badge for a server that could do nothing, with no hint anywhere on screen as to why.

Reported as [#364](https://github.com/Swttch/swttch/issues/364).

## What we did

### Values are looked up in 18 places

A placeholder is resolved against the following, weakest first. Later entries win, so if the same
name appears twice, **the lower one is used.**

| | Where |
|---|---|
| 1 | The process environment |
| 2–9 | Eight files under your home — `~/.claude.json`, `~/.claude/.claude.json`, `~/.claude/claude.json`, `~/.mcp.json`, `~/.claude/.mcp.json`, `~/.claude/mcp.json`, `~/.claude/settings.json`, `~/.claude/settings.local.json` |
| 10 | `projects[<project path>].env` inside `~/.claude.json` |
| 11–18 | The same eight shapes again, this time under `<project>/` |

The home list and the project list **mirror each other one for one**, so a value put in the same
kind of file is picked up at either level. There is no table of which file is the special one to
memorise.

If you have moved your config directory with `CLAUDE_CONFIG_DIR`, that path is followed.

`${VAR:-fallback}` works too. With no value and no fallback the original text is left in place
rather than blanked, because an empty value looks like a setting that was configured and left
blank, which hides the mistake instead of showing it.

### Variables that could not be resolved are named

When no layer defines the value, the MCP server detail view says so in a yellow band at the top.

```
Missing environment variables: NEXUS_MCP_DB_URI
```

It is a warning rather than an error because the server is usually running. It is misconfigured,
not down, and its status badge often genuinely reads `Connected`.

The check runs when the server **list** is loaded. A server broken by a missing variable often
never connects at all, and tools are only requested from connected servers, so checking during the
tool fetch would have stayed quiet in exactly the case that needs the warning.

### Servers without a `type` now show their tools

In `.mcp.json` the `type` field is optional. The official examples list only `command`, `args` and
`env`, and so does the config in the report above.

**Until now, omitting `type` meant an empty tool list** — with no error, so there was no way to
tell a server that genuinely has no tools from one we failed to read. A config with a `command` is
now treated as a `stdio` server.

### Settings files no longer erase each other

Adding a single `env` entry to `~/.claude/settings.local.json` used to drop **every environment
variable** defined in `~/.claude/settings.json`, because the override replaced the whole block
rather than the individual entry. The two are now merged entry by entry.

A related problem is fixed alongside it: an unusable settings file (one containing just `null`,
for instance) used to take the other file's settings down with it.

## How to check it

Open the MCP server detail view and expand **View tools**. The tool list is fetched using the
configuration the server actually receives, so a populated list means the value came through.

If a value is missing, the yellow warning at the top names the variable.

## Related

- Report: [#364](https://github.com/Swttch/swttch/issues/364)
- MCP server management: [003-mcp_server_management](../003-mcp_server_management/en.md)
