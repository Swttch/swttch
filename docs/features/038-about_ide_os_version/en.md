# So filing a bug report no longer means digging through IDE menus

> Language: **English** · [한국어](./ko.md)
>
> Related: [#320](https://github.com/Swttch/swttch/issues/320)

## The report

A user opened [#320](https://github.com/Swttch/swttch/issues/320).

About had only these two lines,

- Plugin Version
- Claude Code Version

while the new bug report form asks for these,

- IDE/Browser (e.g. `IntelliJ IDEA 2026.2.1`)
- OS

> For windows users the OS part isn't important, but for linux it is. And
> checking the IDE/Browser version is a bunch of menu traversal that doesn't have
> to be necessary since the plugin should know where it is.

We were asking the person reporting a bug to go and fetch the details for us.

## We already knew the IDE version

It turned out the value was already there. Nothing was showing it.

When the IDE starts the backend, the Kotlin side composes this string:

```
IntelliJ IDEA 2024.2 (IU-242.20224.300)
```

Product, version, and the build number. It reaches the backend as the
`CCG_CLIENT_INFO` environment variable, where only telemetry read it — no screen
ever did.

So this part was simply a matter of putting it where people could see it.

## The browser needed different treatment

When you connect from a browser (standalone mode), the same field holds a raw
`navigator.userAgent`:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Safari/537.36
```

Far too long to copy into a bug report. So it is reduced to the product and its
version:

```
Chrome 149.0.7827.55
```

That reduction is left to the `bowser` library rather than written by hand,
because user agent strings do not say what they appear to say — Edge's contains
`Chrome`, and Safari's contains no `Chrome` at all. Hand-rolled matching tends to
label Edge as Chrome.

## The OS line was the hard part

The item that looked easiest took the most work.

Node offers `os.release()`. That returns the *kernel* release, which answers a
different question on every platform.

Measured on the macOS machine this was developed on:

| Read via | Value |
|---|---|
| `os.release()` | `25.5.0` |
| The actual macOS version | `26.5.2` |

Not the number the user knows. Had we shown it, the reporter would have written
`25.5.0` into their bug report, and that would be wrong.

Linux fails in the opposite direction. `os.release()` reports the kernel and says
nothing about the **distribution** — which is precisely what the reporter meant
by "for linux it is [important]". That part would have been missing entirely.

So each platform is read from the source that actually identifies it.

| OS | Source | Result |
|---|---|---|
| macOS | `sw_vers` | `macOS 26.5.2 (25F84)` |
| Linux | `/etc/os-release` | `Ubuntu 24.04.1 LTS (kernel 6.8.0-45-generic)` |
| Windows | `os.release()` | `Windows 10.0.26100` |

On Linux the kernel release is kept alongside the distro, because unlike on
macOS it is genuinely diagnostic there.

Every branch degrades to the kernel string if it cannot read its source. A
failure leaves the row plain, never blank or broken.

## Why we do not ask the browser about the OS

The browser can report an OS too. We do not use it.

Apple freezes the macOS version inside the user agent at `10_15_7`, so that
number appears no matter which release is actually running. `bowser` goes further
and names it — reporting `Catalina` for a machine running 26.5.2.

A confidently wrong value is worse than none.

The backend runs on the user's own machine and simply knows better. Whether you
connected from a browser or opened it inside the IDE, the OS row shows what the
backend read.

## The result

Two new rows in About.

Opened inside the IDE:

| | |
|---|---|
| IDE / Browser | `IntelliJ IDEA 2024.2 (IU-242.20224.300)` |
| OS | `macOS 26.5.2 (25F84)` |

Connected from a browser:

| | |
|---|---|
| IDE / Browser | `Chrome 151.0.0.0` |
| OS | `macOS 26.5.2 (25F84)` |

Filing a bug report is now a matter of copying these two lines across.

## A known limit

On Windows we use the build number from `os.release()` (`10.0.26100`), which
matches what winver shows.

Node also has `os.version()`, but its documentation describes it only as "a
string identifying the kernel version", and we could not confirm its exact shape
on Windows — our development machines run macOS. So that value is appended only
when it reads like a name, and never replaces the build number. There is room to
refine this once it can be checked on a real Windows host.
