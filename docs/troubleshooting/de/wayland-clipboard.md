# Einfügen funktioniert nicht, wenn die JetBrains-IDE unter Wayland läuft

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | **Deutsch** | [Français](../fr/wayland-clipboard.md)

_Zuletzt aktualisiert: 2026-10-05_

## Symptome

Das Einfügen in das Chat-Eingabefeld des Plugins schlägt fehl, ohne dass etwas passiert.

Es erscheint auch keine Fehlermeldung.

Ein Detail fällt dabei auf.

Text, der **innerhalb** des Plugins kopiert wurde, lässt sich problemlos einfügen. Nur Text von **außerhalb** — aus einem Browser, einem Terminal, dem IDE-Editor — schlägt fehl.

Im Code-Editor derselben IDE und in Suchfeldern funktioniert das Einfügen normal.

Das betrifft nicht nur Text. **Auch Bilder wie Screenshots schlagen auf dieselbe Weise fehl.**

## Betroffene Umgebungen

Das tritt unter Linux in einer Wayland-Sitzung auf, wenn die IDE selbst als natives Wayland-Programm läuft.

Die Standardeinstellung `-Dawt.toolkit.name=auto` kann diesen Modus wählen, und `WLToolkit` erzwingt ihn.

Bisher wurde es unter Fedora 44, Ubuntu 26.04 und CachyOS gemeldet, jeweils auf dem KDE-Plasma-Desktop.

Wir haben dasselbe Symptom in einer Testsitzung mit dem Compositor sway nachgestellt, sowohl mit IDE 2025.3.4 als auch mit IDE 2026.2.3.

Ein Melder wechselte zu GNOME, woraufhin das Problem verschwand.

## Ursache

Die Oberfläche des Plugins wird von JCEF gezeichnet, der Browser-Engine in der IDE.

In den IDEs, die wir getestet haben (2025.3.4 und 2026.2.3), läuft JCEF als eigener Prozess, und dieser Prozess erreicht die Anzeige über XWayland, die Kompatibilitätsschicht für X11-Programme.

Das IDE-Fenster selbst ist ein natives Wayland-Fenster.

Text, der außerhalb des Plugins kopiert wurde, liegt in der Wayland-Zwischenablage.

XWayland reicht die Wayland-Zwischenablage nur dann an X11-Programme weiter, solange ein X11-Fenster den Fokus hat.

Das IDE-Fenster ist ein Wayland-Fenster, deshalb findet diese Übergabe nie statt, und JCEF sieht eine leere Zwischenablage.

Text, der innerhalb des Plugins kopiert wurde, landet in der X11-Zwischenablage, deshalb lässt sich dieser Text problemlos einfügen.

Wir haben diese Übergabe auf drei Compositoren gemessen: sway, KWin 5.27.5 und KWin 6.7.5 (Plasma 6.7, dieselbe Serie wie unter Fedora 44).

Auf allen dreien konnte ein X11-Programm die Wayland-Zwischenablage nicht lesen, solange ein Wayland-Fenster den Fokus hatte, und konnte sie lesen, solange ein X11-Fenster den Fokus hatte.

Mit `-Dawt.toolkit.name=XToolkit` wird das IDE-Fenster selbst zu einem X11-Fenster, die Zwischenablage wird übergeben, und das Einfügen funktioniert.

Dasselbe Symptom wird auch in anderen JetBrains-Plugins gemeldet, die JCEF verwenden.

Der IDE-Prozess selbst kann diese Zwischenablage lesen, deshalb fragen neuere Plugin-Versionen die IDE danach, sooft ein Einfügen leer ankommt, und das Einfügen funktioniert dann ohne jede Einstellung.

Wenn Sie eine ältere Version verwenden oder das Einfügen trotzdem fehlschlägt, verwenden Sie die Einstellung unten.

## Lösung

Öffnen Sie `Help → Edit Custom VM Options`, fügen Sie die folgende Zeile hinzu und starten Sie die IDE neu.

```
-Dawt.toolkit.name=XToolkit
```

Wenn bereits eine Zeile vorhanden ist, die mit `-Dawt.toolkit.name=` beginnt (etwa `auto` oder `WLToolkit`), ersetzen Sie diese Zeile durch die obige.

Drei Personen haben jeweils auf einer anderen Distribution bestätigt, dass das funktioniert.

## Was Sie beachten sollten

Diese Einstellung setzt die IDE zurück auf XWayland.

Deshalb **kann die Anzeige unscharf wirken, wenn Sie eine gebrochene Skalierung wie 125 % oder 150 % verwenden.**

Es ist eine vorübergehende Umgehung, keine echte Lösung.

Wenn Sie die Unschärfe mehr stört als das Einfügeproblem, können Sie die Einstellung wieder zurücknehmen.

Ein Nutzer mit Arch Linux (omarchy) hat gemeldet, dass mit dieser Einstellung schwebende Fenster der IDE, etwa Popups, an der falschen Stelle erscheinen.

Wir konnten das unter sway nicht nachstellen. Dort öffneten sich Menüs und Popups auch bei 150 % Skalierung an der richtigen Stelle.

Falls Sie das beobachten, teilen Sie uns bitte mit, welchen Desktop oder Compositor Sie verwenden.

## Wann verschwindet das

Sobald die native Wayland-Unterstützung von JetBrains stabil ist, wird es nicht mehr nötig sein.

Das zugehörige Ticket [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) ist noch offen.

Dafür zu stimmen hilft, die Priorität anzuheben.

## Verwandte Links

### Issues in diesem Repository

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### JetBrains-Tickets

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — das JCEF-Zwischenablage-Problem. **Noch offen, Sie können dafür stimmen**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — als "Third-Party problem" geschlossen und als KDE-Fehler eingestuft
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — Unterstützung der Wayland-Zwischenablage, 2024 als behoben markiert
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — Kopieren aus einer JCEF-Vorschau unter Arch/Hyprland nicht möglich
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — die native Wayland-Unterstützung selbst ist noch in Arbeit
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — die ursprüngliche Meldung zum Continue-Plugin, als Duplikat von JBR-5857 geschlossen

### Dasselbe Symptom in anderen Plugins

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — offen
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — der Maintainer [schrieb](https://github.com/cline/cline/issues/8383#issuecomment-4173099236), dass es sich nicht auf Plugin-Seite beheben lässt
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — gemeldet unter Fedora 43/44, Arch, Kubuntu 26.04 und weiteren
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### Externe Verweise

- [KDE-Bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — der KDE-Fehler, auf den JetBrains beim Schließen von JBR-10222 verwiesen hat. Er wurde allerdings bereits in Plasma 6.2.0 behoben, und die Melder hier nutzen neuere Versionen
