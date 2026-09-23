# Vendored desktop-notification binaries

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
| `CFBundleName` → `Swttch`, icon → `icon.icns` | macOS takes a banner's icon and its row in System Settings > Notifications from the sending bundle, and offers no per-notification override. A custom bundle is the documented way to have our own. |
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
Windows has no "must live in Applications" rule, so there is no install step.

Passing `-appID` makes it create the Start Menu shortcut that registers the
AppUserModelID, which is what the previous inline PowerShell toast lacked. It
also exits with a code that distinguishes click from dismissal from timeout,
which is what a later change will read to act on a clicked banner.

**Not verified on real Windows hardware yet.**

---

## Linux

Nothing is vendored. Linux keeps using the system's `notify-send`, which is a
command rather than a file we could ship, and libnotify gives no click result to
read back anyway.
