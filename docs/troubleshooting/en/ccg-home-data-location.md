# Saved accounts, license and other data look reset after updating when CCG_HOME is set

🌐 **English** | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_Last updated: 2026-11-10_

**This applies only if you set the environment variable `CCG_HOME` yourself.** If you never did, nothing changes for you and you can stop reading.

In v0.36.1 and earlier, several kinds of data ignored `CCG_HOME` and stayed in the default folder `~/.claude-code-gui` even when you pointed `CCG_HOME` somewhere else. From the release after v0.36.1 they follow `CCG_HOME`, like your prompts, projects and uploaded files already did. The plugin now looks in the folder `CCG_HOME` names, finds none of your old files there, and starts from scratch. **Nothing was deleted.** The old files are still in the default folder, and copying them over fixes it.

## Symptoms

- `swttch account` (or `ccg account`) says there are no saved accounts, although you saved some before
- The sponsor features are off, as if you had no license key
- The question about sending anonymous usage data shows up again, as if you had never answered it
- The messages you had scheduled are gone from the list

## Who is affected

Run this in the terminal where you start the IDE or the plugin:

| System | Command | Not affected if the output is |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | empty, or the same folder as `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | empty, or the same folder as `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | empty (cmd prints `%CCG_HOME%` itself when it is not set), or the same folder as `%USERPROFILE%\.claude-code-gui` |

If the output is a different folder, you are affected.

## What moved

| File or folder (in the old default folder) | What it holds | What to do |
|---|---|---|
| `accounts.json` and the `accounts` folder | The Claude accounts you saved for quick switching, **including their sign-in data** | Copy |
| `license.json` | Your sponsor license key | Copy |
| `profile.json` | Your answer about anonymous usage data, and this installation's random id | Copy |
| `scheduled-messages.json` | Messages you scheduled | Copy |
| `workflow-agents` folder | The agent names a finished workflow shows after you reopen a chat | Copy if you want to keep them |
| `account-pool-recovery` folder, `cli-registry` folder, `logs/lifecycle.log`, `bin` folder | Short-lived notes, a list of running Claude processes, a start-up log, the downloaded tunnel tool | Nothing, they are rebuilt or downloaded again |

## What did not move

- **`settings.js`** (your plugin settings) stays in the default folder on purpose. The IDE plugin reads and writes the same file and does not know `CCG_HOME`, so both sides must keep using it. Your settings are not reset by this change
- **`auth-secret`**, the secret that protects the connection between the chat page and its backend, also stays, for the same reason: the `swttch` command and the IDE plugin share it
- Your prompts, projects, uploaded files, sent files and usage numbers already followed `CCG_HOME` and are not affected

## How to fix it

Do this **before** you save an account, enter a license or change anything else in the updated version. Copying overwrites what is in the new folder (see "Good to know").

### 1. Stop the plugin

Close the plugin tab in the IDE, or quit the IDE. If you use the browser version, run `swttch stop`.

### 2. Copy the files to the folder `CCG_HOME` names

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
for f in accounts.json accounts license.json profile.json scheduled-messages.json workflow-agents; do
  [ -e ~/.claude-code-gui/$f ] && cp -pR ~/.claude-code-gui/$f "$CCG_HOME/"
done
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
foreach ($f in 'accounts.json','accounts','license.json','profile.json','scheduled-messages.json','workflow-agents') {
  $src = Join-Path $env:USERPROFILE ".claude-code-gui\$f"
  if (Test-Path $src) { Copy-Item $src $env:CCG_HOME -Recurse -Force }
}
```

A file you never had (for example, you never scheduled a message) is simply skipped.

### 3. Start the plugin again

Your saved accounts, license, usage-data answer and scheduled messages are back. `swttch account` lists the accounts.

### 4. Delete the old copies (optional)

Once you have checked that everything is back, you can delete the copied files from `~/.claude-code-gui`. Keep `settings.js` and `auth-secret`, which are still used there. `accounts.json`, the `accounts` folder and `license.json` hold sign-in data and your license key, so extra copies lying around are the only reason to delete them. Nothing needs the old copies any more.

## Good to know

- **Copying overwrites.** If you already saved an account, entered a license or answered the usage-data question after updating, that lives in the new folder, and the copy replaces it with the old version. In that case copy only the item you are missing. For a lost account you can also sign in with `claude` again and run `swttch account save`. A lost license key can be entered again
- You do not need to set `CCG_HOME` differently. Only the place the data is read from changed
- The files keep their owner-only permission when you copy them with the commands above (`cp -p`). Do not widen the permission of `accounts.json`, the `accounts` folder and `license.json`

## Related links

### Document in this repository

- [Prompt library — where the prompts are kept](../../features/064-prompt_library/en.md) — it describes how `CCG_HOME` moves the whole data folder
- [Attach any file type — where copies are stored](../../features/085-attach_any_file_type/en.md) — the uploaded copies also follow `CCG_HOME`
