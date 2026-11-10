# Settings and saved accounts look reset after updating when CCG_HOME is set

🌐 **English** | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_Last updated: 2026-11-10_

**This applies only if you set the environment variable `CCG_HOME` yourself.** If you never did, nothing changes for you and you can stop reading.

In v0.36.1 and earlier, three kinds of data ignored `CCG_HOME` and stayed in the default folder `~/.claude-code-gui` even when you pointed `CCG_HOME` somewhere else. From the release after v0.36.1 they follow `CCG_HOME`, like the rest of the plugin's data already did. The plugin now looks in the folder `CCG_HOME` names, finds none of your old files there, and starts from the defaults. **Nothing was deleted.** The old files are still in the default folder, and copying them over fixes it.

## Symptoms

- After updating, your settings are back to the defaults (theme, font size, and so on)
- `swttch account` (or `ccg account`) says there are no saved accounts, although you saved some before
- Any other place that lists your saved accounts is empty

## Who is affected

Run this in the terminal where you start the IDE or the plugin:

| System | Command | Not affected if the output is |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | empty, or the same folder as `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | empty, or the same folder as `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | empty (cmd prints `%CCG_HOME%` itself when it is not set), or the same folder as `%USERPROFILE%\.claude-code-gui` |

If the output is a different folder, you are affected.

## What moved

| File or folder (in the old default folder) | What it holds |
|---|---|
| `settings.js` | Your plugin settings |
| `accounts.json` and the `accounts` folder | The Claude accounts you saved for quick switching, **including their sign-in data** |
| `cli-registry` | A short-lived list of running Claude processes. **Nothing to do**, it is rebuilt by itself |

## How to fix it

Do this **before** you change a setting or save an account in the updated version. Copying overwrites what is in the new folder (see "Good to know").

### 1. Stop the plugin

Close the plugin tab in the IDE, or quit the IDE. If you use the browser version, run `swttch stop`.

### 2. Copy the files to the folder `CCG_HOME` names

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
cp -p ~/.claude-code-gui/settings.js "$CCG_HOME/"
cp -pR ~/.claude-code-gui/accounts.json ~/.claude-code-gui/accounts "$CCG_HOME/"
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
Copy-Item "$env:USERPROFILE\.claude-code-gui\settings.js" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts.json" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts" $env:CCG_HOME -Recurse -ErrorAction SilentlyContinue
```

A "cannot find" message for a file you never had (for example, you never saved an account) is fine.

### 3. Start the plugin again

Your settings and your saved accounts are back. `swttch account` lists them.

### 4. Delete the old copies (optional)

Once you have checked that everything is back, you can delete `settings.js`, `accounts.json` and the `accounts` folder from `~/.claude-code-gui`. The account files hold sign-in data, so keeping extra copies lying around is the only reason to delete them. Nothing needs the old copies any more.

## Good to know

- **Copying overwrites.** If you already changed a setting or saved an account after updating, those changes live in the new folder, and the copy replaces them with the old versions. In that case copy only the file you are missing. For a lost account, you can also sign in with `claude` again and run `swttch account save`
- You do not need to set `CCG_HOME` differently. Only the place the data is read from changed
- The files keep their owner-only permission when you copy them with the commands above (`cp -p`). Do not widen the permission of `accounts.json` and the `accounts` folder
- Your prompts, projects and uploaded files were never affected. They already followed `CCG_HOME`

## Related links

### Document in this repository

- [Prompt library — where the prompts are kept](../../features/064-prompt_library/en.md) — it describes how `CCG_HOME` moves the whole data folder
- [Attach any file type — where copies are stored](../../features/085-attach_any_file_type/en.md) — the uploaded copies also follow `CCG_HOME`
