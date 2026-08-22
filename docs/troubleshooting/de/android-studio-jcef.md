# Das Chat-Fenster erscheint nicht in Android Studio (JCEF)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | **Deutsch** | [Français](../fr/android-studio-jcef.md)

_Zuletzt aktualisiert: 2026-08-22_

Dieses Plugin zeichnet seine Chat-Oberfläche auf **JCEF** (Chromium Embedded Framework). Anders als andere JetBrains-IDEs liefert Android Studio JCEF nicht standardmäßig mit, weshalb statt des Chats ein Hinweispanel erscheinen kann.

**Die Lösung unterscheidet sich je nach Android-Studio-Version grundlegend.** Prüfen Sie zuerst Ihre Version (**Help → About**).

| Ihre Version | Weiter zu |
|---|---|
| **2026.2 oder neuer** (Rabbit) | [Ab 2026.2: Plugin installieren](#ab-20262-plugin-installieren) |
| **2026.1.3 – 2026.1.x** | [2026.1: Runtime wechseln](#20261-runtime-wechseln) |
| **2026.1.2 oder älter** | [2026.1.2 und älter: keine funktionierende Kombination](#202612-und-älter-keine-funktionierende-kombination) |

---

## Ab 2026.2: Plugin installieren

### Symptome

Beim Öffnen des Chats erscheint ein Hinweispanel; bei älteren Plugin-Versionen wird eine Ausnahme geworfen. In `idea.log` steht:

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

Weiter oben im Log finden Sie außerdem:

```
plugin com.intellij.modules.jcef is not resolved
```

### Ursache

**Seit 2026.2 ist JCEF aus dem IDE-Kern in ein eigenes Plugin ausgelagert.** Es wurde nicht entfernt, sondern hat nur den Ort gewechselt.

JetBrains liefert dieses Plugin mit den eigenen IDEs aus, **Android Studio jedoch nicht**. Deshalb fehlen die Klassen `com.intellij.ui.jcef` in der IDE vollständig.

Entscheidend dabei: **Ein Wechsel der Runtime hilft nicht.** Die JetBrains Runtime stellt nur `org.cef.*` bereit; `com.intellij.ui.jcef` ist Plattform-Code und muss von der IDE kommen. Ein Start mit einer JCEF-fähigen Runtime führt zum selben Ergebnis.

### So beheben Sie es

1. Öffnen Sie **Settings → Plugins → Marketplace**
2. Suchen Sie nach **Web Browser (JCEF)** — das von **JetBrains**
3. Installieren Sie es und starten Sie die IDE neu

Nach dem Neustart erscheint der Chat normal. Die Runtime können Sie unverändert lassen.

> Marketplace-Seite: [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### Geprüfte Kombinationen

| Android Studio | Auslieferungszustand | Mit Web Browser (JCEF) |
|---|---|---|
| **2026.2.1 Canary 2** (AI-262.9437) | Hinweispanel (ältere Plugin-Versionen brechen ab) | **Funktioniert normal** — kein Runtime-Wechsel nötig |

---

## 2026.1: Runtime wechseln

### Symptome

Statt der Chat-Oberfläche erscheint ein Hinweispanel.

### Ursache

Die mit Android Studio ausgelieferte JetBrains Runtime (JBR) enthält kein JCEF. In 2026.1 gehört JCEF noch zum IDE-Kern, daher **löst der Wechsel auf eine JCEF-fähige Runtime das Problem.**

### So beheben Sie es

1. Stellen Sie sicher, dass Android Studio **2026.1.3 oder neuer** ist (für 2026.1.2 und älter siehe den nächsten Abschnitt)
2. Öffnen Sie Find Action: `Cmd+Shift+A` (macOS) oder `Ctrl+Shift+A` (Windows/Linux)
3. Führen Sie **Choose Boot Java Runtime for the IDE…** aus
4. Wählen Sie eine Runtime, deren Name **JCEF** enthält
5. Starten Sie die IDE nach der Installation neu

Die Schaltfläche im Hinweispanel des Plugins öffnet denselben Dialog.

---

## 2026.1.2 und älter: keine funktionierende Kombination

### Symptome

Nach dem Wechsel der Runtime tritt eines von beidem auf.

- Android Studio startet überhaupt nicht
- Es startet, aber das Plugin-Fenster bleibt völlig leer — kein Hinweispanel, keine Fehlermeldung

Bei leerem Fenster steht in `idea.log`:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### Ursache

- Diese Versionen laufen auf Java 21 und bringen eine eigene `JCefAppConfig` mit
- Wählen Sie eine JCEF-fähige **JBR 21**, verdeckt das Runtime-Modul diese mitgelieferte Kopie. Der `JCefAppConfig` in JBR 21 fehlt die Methode `isRemoteEnabled()`, die die Plattform aufruft. Der Browser wird nie erzeugt, das Fenster bleibt leer
- **JBR 25** besitzt die Methode, doch 2026.1.2 und älter starten nicht auf Java 25. Der Security Manager wurde in Java 24 entfernt, diese Builds versuchen ihn weiterhin zu aktivieren

Android Studio **2026.1.3** hat die mitgelieferte Runtime von Java 21 auf Java 25 umgestellt, womit sich das erledigt.

### So beheben Sie es

Aktualisieren Sie Android Studio auf **2026.1.3 oder neuer**.

### Geprüfte Kombinationen

| Android Studio | Mitgelieferte JBR | JCEF-fähige JBR 21 | JCEF-fähige JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — nur Hinweispanel | Leeres Fenster | Startet nicht |
| 2026.1.2 | Java 21 — nur Hinweispanel | Leeres Fenster | Startet nicht |
| **2026.1.3** | **Java 25** | — | **Funktioniert normal** |

---

## Wenn die IDE nach einem Runtime-Wechsel nicht startet

Löschen Sie die Datei `studio.jdk` aus dem Konfigurationsverzeichnis von Android Studio, um die Standard-Runtime wiederherzustellen.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<Version>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<Version>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<Version>\studio.jdk`

## Weiterführende Links

### Issues in diesem Repository

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull Requests in diesem Repository

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Externe Referenzen

- [Web Browser (JCEF) im Marketplace](https://plugins.jetbrains.com/plugin/31360) — das JetBrains-Plugin, das Android Studio um JCEF ergänzt
- [JetBrains-Ankündigung: Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
