# The chat window does not appear on Android Studio (JCEF runtime)

🌐 **English** | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_Last updated: 2026-08-22_

## Symptoms

Opening the plugin on Android Studio shows a guidance panel instead of the chat UI.

After switching the runtime, one of these can happen.

- Android Studio does not start at all
- It starts, but the plugin window is completely blank — no guidance panel, no error message

When the window is blank, `idea.log` contains:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## Cause

The JetBrains Runtime (JBR) that ships with Android Studio does **not** include **JCEF** (Chromium Embedded Framework).

This plugin's UI is drawn on JCEF, so the default runtime shows a guidance panel instead of the chat screen.

Up to here, switching to a JCEF-enabled runtime solves it.

However, **on Android Studio 2026.1.2 and earlier there is no working combination.**

- Those versions run on Java 21 and bundle their own `JCefAppConfig`
- If you pick a JCEF-enabled **JBR 21**, the runtime module shadows that bundled copy. The `JCefAppConfig` in JBR 21 has no `isRemoteEnabled()` method, which the platform calls. The browser is never created, and the window stays blank
- **JBR 25** does have the method, but 2026.1.2 and earlier cannot boot on Java 25. The Security Manager was removed in Java 24, and those builds still try to enable it

Android Studio **2026.1.3** moved its bundled runtime from Java 21 to Java 25, which resolves this.

## Verified combinations

| Android Studio | Bundled JBR | JCEF-enabled JBR 21 | JCEF-enabled JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — guidance panel only | Blank window | Fails to boot |
| 2026.1.2 | Java 21 — guidance panel only | Blank window | Fails to boot |
| **2026.1.3** | **Java 25** | — | **Works normally** |

## How to fix it

1. Update Android Studio to **2026.1.3 or later**
2. Open Find Action: `Cmd+Shift+A` (macOS) or `Ctrl+Shift+A` (Windows/Linux)
3. Run **Choose Boot Java Runtime for the IDE…**
4. Pick a runtime whose name contains **JCEF**
5. Restart the IDE once the install finishes

The **Switch Runtime** button on the plugin's guidance panel opens the same dialog.

## If the IDE will not start after a runtime swap

Delete the `studio.jdk` file from the Android Studio config directory to restore the default runtime.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<version>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<version>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<version>\studio.jdk`

## When will this go away

JetBrains released an experimental [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360) marketplace plugin in April 2025.

It brings JCEF to Android Studio 2026.1 Nightly and later.

Once that becomes stable, the runtime swap above will no longer be needed.

## Related links

### Issues in this repository

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests in this repository

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### External references

- [Web Browser (JCEF) marketplace plugin](https://plugins.jetbrains.com/plugin/31360) — JetBrains' experimental plugin that adds JCEF to Android Studio
