# Das Chat-Fenster erscheint nicht in Android Studio (JCEF-Runtime)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | **Deutsch** | [Français](../fr/android-studio-jcef.md)

_Zuletzt aktualisiert: 2026-08-22_

## Symptome

Wenn Sie das Plugin in Android Studio öffnen, erscheint statt der Chat-Oberfläche ein Hinweispanel.

Nach dem Wechsel der Runtime kann eines von beidem passieren.

- Android Studio startet überhaupt nicht mehr
- Es startet zwar, aber das Plugin-Fenster ist völlig leer — kein Hinweispanel, keine Fehlermeldung

Bei einem leeren Fenster steht in `idea.log`:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## Ursache

Die JetBrains Runtime (JBR), die mit Android Studio ausgeliefert wird, enthält **kein JCEF** (Chromium Embedded Framework).

Die Oberfläche dieses Plugins wird auf JCEF gezeichnet, deshalb zeigt die Standard-Runtime ein Hinweispanel statt des Chat-Fensters.

Bis hierhin lässt sich das durch den Wechsel auf eine Runtime mit JCEF lösen.

Allerdings gibt es **auf Android Studio 2026.1.2 und älter überhaupt keine funktionierende Kombination.**

- Diese Versionen laufen auf Java 21 und bringen eine eigene `JCefAppConfig` mit
- Wählen Sie eine **JBR 21** mit JCEF, überdeckt das Runtime-Modul diese mitgelieferte Kopie. Der `JCefAppConfig` in JBR 21 fehlt die Methode `isRemoteEnabled()`, die die Plattform aufruft. Der Browser wird nie erzeugt und das Fenster bleibt leer
- **JBR 25** hat diese Methode, aber 2026.1.2 und älter starten nicht unter Java 25. Der Security Manager wurde in Java 24 entfernt, und diese Builds versuchen weiterhin, ihn zu aktivieren

Android Studio **2026.1.3** hat die mitgelieferte Runtime von Java 21 auf Java 25 umgestellt, womit das Problem gelöst ist.

## Geprüfte Kombinationen

| Android Studio | Mitgelieferte JBR | JBR 21 mit JCEF | JBR 25 mit JCEF |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — nur Hinweispanel | Leeres Fenster | Startet nicht |
| 2026.1.2 | Java 21 — nur Hinweispanel | Leeres Fenster | Startet nicht |
| **2026.1.3** | **Java 25** | — | **Funktioniert normal** |

## Lösung

1. Aktualisieren Sie Android Studio auf **2026.1.3 oder neuer**
2. Öffnen Sie Find Action: `Cmd+Shift+A` (macOS) oder `Ctrl+Shift+A` (Windows/Linux)
3. Führen Sie **Choose Boot Java Runtime for the IDE…** aus
4. Wählen Sie eine Runtime, deren Name **JCEF** enthält
5. Starten Sie die IDE neu, sobald die Installation abgeschlossen ist

Die Schaltfläche **Switch Runtime** im Hinweispanel des Plugins öffnet denselben Dialog.

## Wenn die IDE nach dem Runtime-Wechsel nicht mehr startet

Löschen Sie die Datei `studio.jdk` im Konfigurationsverzeichnis von Android Studio, um die Standard-Runtime wiederherzustellen.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<Version>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<Version>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<Version>\studio.jdk`

## Wann verschwindet das

JetBrains hat im April 2025 ein experimentelles Marketplace-Plugin namens [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360) veröffentlicht.

Es bringt JCEF zu Android Studio 2026.1 Nightly und neuer.

Sobald das stabil ist, wird der oben beschriebene Runtime-Wechsel nicht mehr nötig sein.

## Verwandte Links

### Issues in diesem Repository

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull Requests in diesem Repository

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Externe Verweise

- [Web Browser (JCEF) im Marketplace](https://plugins.jetbrains.com/plugin/31360) — das experimentelle Plugin von JetBrains, das JCEF zu Android Studio hinzufügt
