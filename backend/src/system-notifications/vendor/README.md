# Desktop-notification runtime assets

Two vendored notifier binaries, their licences, and the picture the Windows
toast wears — which is ours rather than vendored, but lives here because this is
the directory every build path carries next to `backend.mjs`.

`notifier.ts` shells out to these instead of writing an inline `osascript` /
PowerShell script, because an inline script cannot carry a click action: the
user taps the banner and Script Editor opens instead of the IDE.

Everything in this directory is a runtime asset, not source to bundle. It lives
NEXT TO `notifier.ts` on purpose — `notifier.ts` resolves it with
`new URL('./vendor/…', import.meta.url)`, which lands on this directory when the
backend runs from `src/` under tsx, and on `dist/vendor/` when it runs from the
esbuild bundle. That is the same trick `core/win-job.ts` uses for
`win-job-wrapper.ps1`.

**Three build paths copy this directory, and all three must stay in step** —
`backend/esbuild.mjs`, the `syncWebviewResources` Gradle task in
`build.gradle.kts`, and the `standalone-tgz` case in `scripts/build.sh`. A
distributable that forgets one of them loses desktop notifications silently,
because `notifier.ts` swallows every failure by design.

### There is a fourth place, and it is where this used to be lost

Building a distributable that contains these files is not the same as putting
them on a user's machine. The IDE unpacks its own JAR into a version-scoped
directory at first run — `PluginResourceExtractor.extractBackend` — and for a
long time that step copied `backend.mjs` and `win-job-wrapper.ps1` **by name**.
The three paths above all did their job, the plugin JAR carried this whole
directory, and it still never arrived: desktop notifications had never once
worked for anyone who installed the plugin from the Marketplace. Nothing showed
it in development either: `run-ide` turns on the plugin's dev mode, which serves
the source tree and returns before the extraction runs at all.

That step now unpacks the entire `/backend/` resource tree, so **a new file
dropped in here follows on its own and only the three copy sites above need
touching.** Two things still do not follow on their own, and both are about the
file rather than its presence:

| What still needs a thought | Where |
|---|---|
| The executable bit. A JAR carries none, so anything that has to *run* has to be re-marked after unpacking. The extractor does this for `<name>.app/Contents/MacOS/*` by bundle layout, so a second macOS bundle is covered and a loose executable added here is not. | `PluginResourceExtractor.restoreBundleExecutableBits` |
| Where `notifier.ts` looks the file up. Resolution is `new URL('./vendor/…', import.meta.url)`, so the *name* of this directory and the paths inside it are part of the contract. | `notifier.ts` |

---

## `Swttch Notifier.app` (macOS)

| | |
|---|---|
| Upstream | <https://github.com/julienXX/terminal-notifier> |
| Version | 3.1.0 (released 2026-08-30), **rebuilt from source** — see below |
| License | MIT — `terminal-notifier-LICENSE.txt` |
| Architectures | universal (x86_64 + arm64), so no Rosetta |
| Bundle identifier | `com.github.yhk1038.claude-code-gui.notifier` |
| Notification API | `UNUserNotificationCenter` (3.x dropped the deprecated `NSUserNotification`) |

### Why this is not the upstream release binary

Upstream's 3.1.0 asks macOS for alert and sound permission but **not badge**
permission, and a permission never requested cannot be granted afterwards — the
row simply does not exist in System Settings for that app, forever. One line of
its source fixes that, so the executable here is built from the 3.1.0 tag with
that line changed and nothing else.

Reproduce:

```sh
git clone --depth 1 --branch 3.1.0 https://github.com/julienXX/terminal-notifier.git
cd terminal-notifier
# AppDelegate.m, in the UNAuthorizationStatusNotDetermined branch:
#   - UNAuthorizationOptions opts = UNAuthorizationOptionAlert | UNAuthorizationOptionSound;
#   + UNAuthorizationOptions opts = UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge;
xcodebuild -project "Terminal Notifier.xcodeproj" -target terminal-notifier \
  -configuration Release SYMROOT=/tmp/tn-build ONLY_ACTIVE_ARCH=NO \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO
```

Then the executable is copied into this bundle and the bundle re-signed ad hoc.

### Why the bundle is ours rather than upstream's

Three things are changed from the stock bundle, and each one is load-bearing:

| Change | Why |
|---|---|
| `CFBundleIdentifier` → `com.github.yhk1038.claude-code-gui.notifier` | macOS keys notification permission to this string. Sharing upstream's would mean inheriting — or fighting over — the grant belonging to a copy of terminal-notifier the user installed themselves. It also stops us shipping a rebuilt binary under the upstream author's domain. |
| `CFBundleName` → `Swttch Notifier`, icon → `icon.icns` | macOS takes a banner's icon and its row in System Settings > Notifications from the sending bundle, and offers no per-notification override. A custom bundle is the documented way to have our own. `Swttch Notifier` rather than plain `Swttch` on purpose: a desktop app is planned under the name `Swttch` itself, and the toast sender would otherwise be indistinguishable from it. |
| `Contents/Resources/Terminal.icns` deleted | Upstream's license says that file is a copy of Apple's Terminal.app icon and is Apple's copyright, so it may not be redistributed. |

Re-signing after any of these:

```sh
codesign --force --deep --sign - Swttch Notifier.app
codesign --verify --deep --strict Swttch Notifier.app   # must report "valid on disk"
```

**The identifier must not change again.** macOS treats a new one as an app it
has never seen: every existing user would be asked for permission afresh and
would lose the alert style they had chosen. `macNotifierBundleId()` reads it out
of this bundle rather than repeating the string, so there is exactly one place
it lives.

### Why it is copied into `~/Applications` at runtime

macOS only wires a bundle into the notification permission system when the
bundle sits in an Applications directory. Measured on macOS 26.6.2 with
`-diagnose`:

| Bundle location | `alert style` | `notification centre` | Firing a notification |
|---|---|---|---|
| Anywhere else (plugin resource dir, a checkout) | `none` | `not supported` | `Notifications are not allowed for this application` |
| `~/Applications` | `banners` | `enabled` | delivered |

So `notifier.ts` copies this bundle to `~/Applications/Swttch Notifier.app` on first use
and runs the copy, never the one in the plugin's resource directory.

### Quarantine

The copy is unquarantined before anything else touches it. macOS flags anything
that came from the internet, and that flag travels from the downloaded
marketplace zip into the plugin jar and into every file unpacked out of it.
Gatekeeper answers a quarantined ad-hoc-signed binary by **killing it** and
offering to move it to the Bin — measured end to end from a zip marked the way
Safari marks a download. Nothing is logged; the process is simply gone.

No local build is ever quarantined, so no amount of development testing shows
this. It only appears for users who installed the plugin the normal way, which
is all of them.

**The real fix is a Developer ID signature plus notarisation**, which would make
the flag harmless rather than removed. Until this plugin ships with one, clearing
it is what makes desktop notifications work at all.

### LaunchServices

A freshly copied bundle also has to be announced to LaunchServices, and the
backend **waits** for that to finish: macOS takes the banner's icon from what
LaunchServices knows, so a registration still in flight means the first banner —
the one that also asks for permission — arrives wearing a blank placeholder icon.

## `ntfytoast.exe` (Windows)

| | |
|---|---|
| Upstream | <https://github.com/Aetherinox/ntfy-toast> (a SnoreToast fork) |
| Obtained from | the npm package `toasted-notifier@10.1.0`, path `package/vendor/ntfyToast/ntfytoast.exe` |
| License | MIT — `ntfytoast-LICENSE.txt`, copied verbatim from the same package |
| SHA-256 | `6cfcd1a6573250dadf37f0990b430a5daec39c5187718756aebf2891872c6c9f` |

Unmodified. It is run straight from wherever the backend bundle is unpacked —
Windows has no "must live in Applications" rule, so there is no copy step.

Everything below was measured on **Windows 11 build 26200.9457** against this
exact binary. It is not read off the help text, and where the two disagree the
measurement is what `notifier.ts` follows.

### `-appID` alone is not a registration

Its own help says so:

```
[-appID] <App.ID>  |  Don't create a shortcut but use the provided app id.
```

So `-appID "Swttch Notifier"` on a machine where nothing has ever registered
that id tells Windows which application to file the toast under, and Windows
answers by **dropping the interactive half of the notification**: the banner
appears, the button asked for with `-b "Open session"` is not drawn, and
clicking the banner body ends the process with `3` (TimedOut) rather than `4`
(ButtonPressed). The click never reaches the backend and the user never gets
back to their session.

`-install <shortcut name> <application> <appID>` is what registers it, by
putting a Start Menu shortcut carrying the AppUserModelID in place. After that
the same command draws the button and a press exits `4` with the label on
stdout. `notifier.ts` runs it once per backend process, waited on with
`spawnSync`, before the first toast.

The id is `Swttch Notifier` — not plain `Swttch` — for the same reason as the
macOS `CFBundleName` above: a desktop app is planned under the name `Swttch`
itself, and this toast sender needs a name of its own to stay distinct from it.
The space in that id is not a Windows restriction: measured on Windows 11 build
26200.9457, `-install "Swttch Notifier" <exe> "Swttch Notifier"` installs
cleanly (exit `0`) and a toast fired with `-appID "Swttch Notifier"` afterward
displays normally.

**Waiting is not quite enough.** The round of notifications fired immediately
after the shortcut appeared still came out without the button; only the next
round had it. Windows takes a moment longer to pick the shortcut up than the
install process takes to exit, and there is no measured signal to wait on — the
same shape as the macOS LaunchServices race, and written down rather than
papered over with a sleep nobody can justify.

### Exit codes

`-1` Failed · `0` Success · `1` Hidden · `2` Dismissed · `3` TimedOut ·
`4` ButtonPressed · `5` TextEntered. `isClickToFocus` reads `0` and `4` as the
user asking to be taken back.

### The rest of what was measured

| | |
|---|---|
| `-p <absolute path>` | Puts our logo on the toast, in both its header and its body. PNG, at most 1024x1024, under 200 kB. `windows-toast-icon.png` here is 256x256 and 25 kB. |
| Same `-id` twice | The second toast replaces the first; only the second is left in the notification centre. That is what `groupId` relies on. |
| Duration | 7 seconds by default, 25.5 with `-d long`. `-persistent` keeps the toast up but ends the process with `-1` (Failed) after 60 seconds, so it is not used: an ordinary ending we had to log as a failure is how real failures stop being noticed. |
| `-silent` | Without it Windows plays its own notification sound. The webview already rings the one the user chose, so the flag is always passed. |
| SmartScreen | Does not block it. A copy marked with the Mark-of-the-Web (`ZoneId=3`, the way a download is marked) ran with the same lifetime and the same exit code as the original — so Windows has no counterpart to the macOS quarantine problem below. |

## `windows-toast-icon.png`

Ours, not vendored: the same logo as the macOS bundle's `Contents/Resources/icon.icns`,
converted with `sips -s format png … -Z 256`.

It sits here rather than with the plugin's other icons because this directory is
the one every build path carries next to `backend.mjs`, which is where
`notifier.ts` resolves it. macOS needs no equivalent — there the banner's icon
comes from the sending bundle, and Windows takes it from the notification
instead.

---

## Linux

Nothing is vendored. Linux keeps using the system's `notify-send`, which is a
command rather than a file we could ship, and libnotify gives no click result to
read back anyway.
