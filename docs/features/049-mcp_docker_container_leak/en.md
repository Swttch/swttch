# MCP servers run through Docker no longer pile up containers

> Language: **English** · [한국어](./ko.md)

## What went wrong

Running an MCP server through Docker is a common setup.

```json
{
  "mcpServers": {
    "postgres-dev": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "crystaldba/postgres-mcp:latest"]
    }
  }
}
```

The `--rm` makes it look like the container cleans itself up. It did not.
**Every refresh of the MCP panel left two more containers running, and none of
them were ever removed.** The person who reported this found 67 of them holding
4.2 GB after about half a day.

They also slip past the usual cleanup scripts. Such a container is neither
`exited` nor old — it is sitting there `Up` — so filters based on status or age
skip it entirely.

## Why `--rm` never fired

With `docker run`, **the thing we hold is not the container but the `docker`
client**. The daemon owns the container; the client is only attached to its
streams.

Shutting a server down closes its stdin, then sends SIGTERM if it is still
there, then SIGKILL. All three land **on the client**. If PID 1 inside the
container neither exits on EOF nor handles SIGTERM, it survives all three, and
`--rm` waits for the *container* to exit, so it never fires.

Docker records nothing about who started a container either. Comparing
`docker inspect` before and after killing the client shows **not one changed
field**, and the labels are empty. There is no way to recognise an orphan after
the fact.

## What changed

### A refresh no longer starts the servers again

The panel used to learn the status by running `claude mcp list` and
`claude mcp get` **fresh each time**. Each of those boots a CLI that connects to
every server, so asking about status was itself what started two more of them.

Now it **asks the CLI that is already running**. The process your chat is
talking to already holds those connections, so the answer costs nothing new.

It is also more accurate. Before, the panel showed **what a different process
had just probed**, which can disagree with what your live session actually
holds. Now the same process answers for itself.

The tool list arrives in that same reply, so opening a server's detail no longer
**opens a second connection** just to ask for it.

When there is no running CLI to ask — before a chat has sent its first message —
the official commands answer exactly as they did before. That route stays.

### Nothing is started where it is not needed

The internal check for whether the Fable model is available asks the model one
question and stops. It has no use for MCP servers at all, yet it started every
one the workspace configures and left a container behind each time. It now loads
none.

### What remains is reclaimed

A chat session and the `mcp` commands genuinely need those servers, so for those
the containers have to be cleaned up afterwards.

Just before a CLI starts, the containers of the configured images are noted;
when **that CLI exits**, they are counted again. Only a container that appeared
in between **and** matches the image and exact run arguments from your
configuration is removed. Neither condition alone is enough — that is what keeps
a container you started yourself from the same image safe.

The trigger is **when the CLI process ends, not when the session ends**. One chat
session outlives many CLI processes: a dropped pipe, a `--resume`, a
permission-mode change each replace it, and **each replacement starts its own
container**. Waiting for the session would let all the ones in between pile up.

### Nothing is stranded if the plugin is killed

If the backend is killed outright rather than shut down, that cleanup never gets
to run. So each chat CLI **writes down the ids of its containers in advance**,
and the next time the plugin starts it uses that record to remove what was left.

Containers belonging to a session still running in another window are not
touched. Only records whose owner is already gone are cleaned up.

## If you don't use Docker

If no MCP server in your configuration runs through `docker`, none of this code
runs at all — the configuration is read first and that is where it stops. The
same is true when Docker is not installed. In every uncertain case it fails
towards leaving containers alone.

## Related

- [#363](https://github.com/Swttch/swttch/issues/363) — the report
