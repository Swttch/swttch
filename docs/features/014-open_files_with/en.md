# "Open files with": detect and launch your editor of choice

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#213](https://github.com/Swttch/swttch/issues/213), [#214](https://github.com/Swttch/swttch/pull/214)

## What's new

The **"Open files with"** setting now really works. It detects the editors and
IDEs installed on your machine and opens a clicked file reference in the one you
pick — and it launches that editor correctly on macOS, Windows, and Linux.

Before, the picker only offered a couple of editors, never listed JetBrains
IDEs at all, the custom option didn't do anything, and on Windows/Linux the
chosen editor failed to launch. Now it detects the JetBrains family, VS Code,
Cursor, Xcode, Zed, and more, and actually opens them.

The same rework is applied to **terminal detection** (the "Terminal App"
setting), which previously duplicated the old, thin probing and couldn't even
find macOS's own Terminal.app.

## What you see

The setting lives at **Settings → CLI**, at the top.

- **When a JetBrains IDE is attached** (a JCEF webview, or a browser tab opened
  from an IDE session): the value is fixed to that IDE and not editable — a
  clicked reference already opens in the connected IDE at its line/column.
- **In a standalone browser** (no IDE): a dropdown of the editors detected on
  your machine, plus **System default** (the OS opener) and **Configure Custom
  Editor…**. Picking Custom reveals a **Path** field (with a file picker) and an
  **Arguments** field whose `%TARGET_PATH%` token is replaced with the file
  path — the same shape as GitHub Desktop's external-editor UI.

The Terminal App picker in the same tab now lists the terminals it actually
finds (e.g. Terminal, iTerm2), the same way.

## How it works

Detection follows GitHub Desktop's open-source external-editor/shell approach —
no private APIs, consistent with the project's CLI-equivalence principle:

- **macOS** reads each application's bundle id from its `Info.plist`, building an
  inventory of installed apps. This works even when Spotlight indexing is
  disabled (common on dev machines), where `mdfind`/`mdls` return nothing. The
  scan covers `/Applications`, `~/Applications`, and the system app folders, so
  JetBrains Toolbox installs and Terminal.app are both found.
- **Windows** queries the uninstall registry (including generated JetBrains
  version keys and the JetBrains Toolbox entries) via `reg`, with no native
  module dependency.
- **Linux** probes `PATH`.

The chosen editor's name is saved. Opening a file resolves that name to the
app's install path and launches it — `open -a` on macOS, a detached spawn
elsewhere. A custom editor is launched from its path with the expanded
arguments.

Editors and terminals **share a single detection engine and catalog**, so the
two settings stay consistent and there's no duplicated per-OS probing.

Settings writes were also made **atomic and serialized**: two rapid changes used
to interleave their read-modify-write of the settings file and could corrupt it;
now each write completes before the next begins and is written via a temp file +
rename.
