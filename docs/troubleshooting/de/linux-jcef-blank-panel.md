# Der Chat-Tab öffnet sich unter Linux völlig leer

🌐 [English](../en/linux-jcef-blank-panel.md) | [한국어](../ko/linux-jcef-blank-panel.md) | [日本語](../ja/linux-jcef-blank-panel.md) | [中文](../zh/linux-jcef-blank-panel.md) | [Español](../es/linux-jcef-blank-panel.md) | **Deutsch** | [Français](../fr/linux-jcef-blank-panel.md)

_Zuletzt aktualisiert: 2026-09-08_

## Symptome

Der Chat-Tab öffnet sich, aber sein Inhalt bleibt vollständig leer.

Der Text `Waiting for project indexing...` erscheint kurz, verschwindet wieder, und nichts nimmt seinen Platz ein.

Es erscheint weder eine Fehlermeldung noch ein Hinweisfeld. Der Tab bleibt einfach leer.

## Prüfen Sie zuerst das hier

Öffnen Sie in derselben IDE eine beliebige `.md`-Datei und schalten Sie deren Markdown-Vorschau ein.

**Wenn die Markdown-Vorschau ebenfalls leer ist, ist dieses Dokument das richtige für Sie.**

Diese Vorschau wird von der IDE selbst gezeichnet, nicht von diesem Plugin. Wenn beide Ansichten gleichzeitig leer bleiben, liegt das Problem am eingebetteten Browser der IDE (JCEF) und nicht an einem einzelnen Plugin.

Diese eine Prüfung spart viel Zeit, denn von außen sehen ein leerer Chat-Tab und ein defektes JCEF genau gleich aus.

## Betroffene Umgebungen

Das Problem tritt unter Linux auf.

Bestätigt wurde es unter Ubuntu 22.04 mit PhpStorm 2026.2.2, auf einem Rechner mit NVIDIA-Grafikkarte in einer Wayland-Sitzung.

Die meldende Person hatte mehrere JCEF-Registry-Werte von ihren Standardwerten abweichend gesetzt, um ein anderes Wayland-Problem zu umgehen.

Zwei Punkte machen das Problem wahrscheinlicher:

- eine **Wayland**-Sitzung statt X11
- der proprietäre **NVIDIA**-Treiber

## Ursache

Dieses Plugin zeichnet seine Chat-Oberfläche auf **JCEF** (Chromium Embedded Framework), also auf derselben Komponente, die die IDE für ihre Markdown-Vorschau und ihren integrierten Browser verwendet.

JCEF rendert über die GPU. Wenn dieser Weg bei einer bestimmten Kombination aus Treiber und Sitzung nicht funktioniert, wird der Browser zwar erfolgreich erzeugt, aber es wird nie ein Bild gezeichnet, und das Panel bleibt leer.

Diesen Fall erkennen wir bisher nicht. Wenn JCEF nicht nutzbar ist oder unser Backend nicht startet, ersetzen wir den Platzhalter durch ein Panel, das die Lage erklärt. Ein JCEF, das normal startet und danach nie zeichnet, sieht von unserer Seite wie ein Erfolg aus. Deshalb bleibt Ihnen ein leerer Tab ohne jede Meldung.

## So beheben Sie es

Probieren Sie die Schritte in dieser Reihenfolge. Schritt 1 hat den gemeldeten Fall gelöst.

### 1. Setzen Sie die JCEF-Registry-Werte auf die Standardwerte zurück

Öffnen Sie `Help → Find Action`, führen Sie **Registry…** aus und suchen Sie nach `jcef`.

Prüfen Sie diese vier Einträge und setzen Sie alle zurück, die nicht mehr auf dem Standardwert stehen.

| Eintrag | Standardwert |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

Geänderte Einträge werden fett dargestellt, und der Registry-Dialog hat eine Schaltfläche **Restore Defaults**.

Starten Sie die IDE anschließend neu.

Werte, die zum Umgehen eines anderen Wayland-Problems gesetzt wurden, sind ein häufiger Grund, hier zu landen.

### 2. Wechseln Sie die Sitzung auf X11

Melden Sie sich ab und wählen Sie im Anmeldebildschirm eine **X11**-Sitzung (oder „Xorg") statt Wayland.

Wenn Sie den Desktop lieber auf Wayland lassen möchten, können Sie nur die IDE auf XWayland umstellen. Öffnen Sie `Help → Edit Custom VM Options`, fügen Sie die folgende Zeile hinzu und starten Sie neu.

```
-Dawt.toolkit.name=XToolkit
```

Falls bereits eine Zeile vorhanden ist, die mit `-Dawt.toolkit.name=` beginnt, ersetzen Sie diese.

### 3. Nur wenn die ersten beiden Schritte nicht geholfen haben, schalten Sie die GPU-Beschleunigung ab

Das ist die Gegenrichtung zu Schritt 1. Versuchen Sie es also erst, nachdem Schritt 1 gescheitert ist.

Setzen Sie in **Registry…** den Wert `ide.browser.jcef.gpu.disable` auf `true` und starten Sie neu.

JetBrains hat genau das einer Person vorgeschlagen, deren eingebetteter Browser leer blieb, und daraufhin wurde die Darstellung wieder sichtbar ([IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)).

## Was Sie beachten sollten

**Notieren Sie den ursprünglichen Wert, bevor Sie einen Registry-Eintrag ändern.** Diese Einstellungen wirken sich auf jeden Teil der IDE aus, der den eingebetteten Browser nutzt, nicht nur auf dieses Plugin.

Der Wechsel zu X11 oder XWayland setzt die IDE auf den älteren Darstellungsweg zurück. **Das Bild kann dadurch unscharf wirken, wenn Sie eine gebrochene Skalierung wie 125 % oder 150 % verwenden.** Es ist ein Behelf, und Sie können ihn jederzeit rückgängig machen.

Wenn Sie die GPU-Beschleunigung abschalten, rendert JCEF über die CPU, was bei aufwendigen Seiten langsamer sein kann.

## Wenn nichts davon hilft

In dieser Situation bittet JetBrains um ein ausführliches JCEF-Log.

Fügen Sie die folgende Zeile unter `Help → Edit Custom VM Options` hinzu, starten Sie neu, rufen Sie den leeren Tab erneut hervor und holen Sie die Datei `~/jcef_<PID>.log`.

```
-Dide.browser.jcef.log.level=verbose
```

Hängen Sie diese Datei bitte an, wenn Sie [ein Issue anlegen](https://github.com/Swttch/swttch/issues/new/choose), zusammen mit Ihrer Distribution, Ihrem Sitzungstyp (Wayland oder X11) und Ihrem Grafiktreiber.

## Wann verschwindet das

Der Behelf wird überflüssig, sobald JCEF auf diesen Kombinationen aus Treiber und Sitzung zuverlässig zeichnet.

Die folgenden Tickets sind noch offen, und Abstimmen hilft dabei, ihre Priorität zu erhöhen.

Wir prüfen außerdem, ob das Plugin einen Browser erkennen kann, der nie zeichnet, um Ihnen das auf dem Bildschirm mitzuteilen, statt Ihnen einen leeren Tab zu hinterlassen.

## Verwandte Links

### Issues in diesem Repository

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### JetBrains-Tickets

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — ein eingebetteter Browser, der unter Linux leer bleibt, zurückgeführt auf einen VA-API-Fehler. **Noch offen, und Sie können dafür abstimmen.** JetBrains hat dort `ide.browser.jcef.gpu.disable` vorgeschlagen, und die meldende Person hat die Wirkung bestätigt
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — GPU-Beschleunigung, die JCEF unter Linux mit dem NVIDIA-Treiber zerstört, samt der Bitte um einen verlässlichen Weg, sie abzuschalten. **Noch offen**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — die native Wayland-Unterstützung selbst, weiterhin in Arbeit
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — dasselbe Symptom eines weißen Bildschirms, mangels Informationen als Incomplete geschlossen

### Verwandte Dokumente

- [Wayland-Zwischenablage](wayland-clipboard.md) — das andere Wayland-Problem, bei dem das Einfügen in das Chat-Eingabefeld fehlschlägt
