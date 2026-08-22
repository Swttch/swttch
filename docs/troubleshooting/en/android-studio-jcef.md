# The chat window does not appear on Android Studio (JCEF)

🌐 **English** | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_Last updated: 2026-08-22_

This plugin draws its chat UI on **JCEF** (Chromium Embedded Framework). Unlike other JetBrains IDEs, Android Studio does not ship JCEF by default, so you may get a guidance panel instead of the chat.

**The fix differs completely depending on your Android Studio version.** Check yours first (**Help → About**).

| Your version | Go to |
|---|---|
| **2026.2 or later** (Rabbit) | [2026.2 and later: install the plugin](#20262-and-later-install-the-plugin) |
| **2026.1.3 – 2026.1.x** | [2026.1: switch the runtime](#20261-switch-the-runtime) |
| **2026.1.2 or earlier** | [2026.1.2 and earlier: no working combination](#202612-and-earlier-no-working-combination) |

---

## 2026.2 and later: install the plugin

### Symptoms

Opening the chat shows a guidance panel, or — on older plugin versions — throws an exception. `idea.log` contains:

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

Earlier in the log you will also find:

```
plugin com.intellij.modules.jcef is not resolved
```

### Cause

**As of 2026.2, JCEF moved out of the IDE core into a separate plugin.** It was not removed — it changed address.

JetBrains ships that plugin with its own IDEs, but **Android Studio does not bundle it**. The `com.intellij.ui.jcef` classes are therefore absent from the IDE entirely.

The important part: **switching the runtime does not help.** The JetBrains Runtime supplies `org.cef.*` only; `com.intellij.ui.jcef` is platform code that has to come from the IDE. Booting a JCEF-enabled runtime produces the same result.

### How to fix it

1. Open **Settings → Plugins → Marketplace**
2. Search for **Web Browser (JCEF)** — the one by **JetBrains**
3. Install it and restart the IDE

The chat appears normally after the restart. You can leave the runtime on its default.

> Marketplace page: [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### Verified combinations

| Android Studio | Out of the box | With Web Browser (JCEF) |
|---|---|---|
| **2026.2.1 Canary 2** (AI-262.9437) | Guidance panel (older plugin versions throw) | **Works normally** — no runtime swap needed |

---

## 2026.1: switch the runtime

### Symptoms

A guidance panel appears instead of the chat UI.

### Cause

The JetBrains Runtime (JBR) bundled with Android Studio does not include JCEF. On 2026.1, JCEF is still part of the IDE core, so **switching to a JCEF-enabled runtime solves it.**

### How to fix it

1. Make sure Android Studio is **2026.1.3 or later** (for 2026.1.2 and earlier, see the section below)
2. Open Find Action: `Cmd+Shift+A` (macOS) or `Ctrl+Shift+A` (Windows/Linux)
3. Run **Choose Boot Java Runtime for the IDE…**
4. Pick a runtime whose name contains **JCEF**
5. Restart the IDE once the install finishes

The button on the plugin's guidance panel opens the same dialog.

---

## 2026.1.2 and earlier: no working combination

### Symptoms

After switching the runtime, one of these happens.

- Android Studio does not start at all
- It starts, but the plugin window is completely blank — no guidance panel, no error message

When the window is blank, `idea.log` contains:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### Cause

- Those versions run on Java 21 and bundle their own `JCefAppConfig`
- If you pick a JCEF-enabled **JBR 21**, the runtime module shadows that bundled copy. The `JCefAppConfig` in JBR 21 has no `isRemoteEnabled()` method, which the platform calls. The browser is never created, and the window stays blank
- **JBR 25** does have the method, but 2026.1.2 and earlier cannot boot on Java 25. The Security Manager was removed in Java 24, and those builds still try to enable it

Android Studio **2026.1.3** moved its bundled runtime from Java 21 to Java 25, which resolves this.

### How to fix it

Update Android Studio to **2026.1.3 or later**.

### Verified combinations

| Android Studio | Bundled JBR | JCEF-enabled JBR 21 | JCEF-enabled JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — guidance panel only | Blank window | Fails to boot |
| 2026.1.2 | Java 21 — guidance panel only | Blank window | Fails to boot |
| **2026.1.3** | **Java 25** | — | **Works normally** |

---

## If the IDE will not start after a runtime swap

Delete the `studio.jdk` file from the Android Studio config directory to restore the default runtime.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<version>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<version>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<version>\studio.jdk`

## Related links

### Issues in this repository

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests in this repository

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### External references

- [Web Browser (JCEF) marketplace plugin](https://plugins.jetbrains.com/plugin/31360) — JetBrains' plugin that adds JCEF to Android Studio
- [JetBrains announcement: Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
