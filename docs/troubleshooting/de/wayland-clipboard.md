# Einfügen funktioniert nicht, wenn die JetBrains-IDE unter Wayland läuft

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | **Deutsch** | [Français](../fr/wayland-clipboard.md)

_Zuletzt aktualisiert: 2026-08-22_

## Symptome

Das Einfügen in das Chat-Eingabefeld des Plugins schlägt fehl, ohne dass etwas passiert.

Es erscheint auch keine Fehlermeldung.

Ein Detail fällt dabei auf.

Text, der **innerhalb** des Plugins kopiert wurde, lässt sich problemlos einfügen. Nur Text von **außerhalb** — aus einem Browser, einem Terminal, dem IDE-Editor — schlägt fehl.

Im Code-Editor derselben IDE und in Suchfeldern funktioniert das Einfügen normal.

Das betrifft nicht nur Text. **Auch Bilder wie Screenshots schlagen auf dieselbe Weise fehl.**

## Betroffene Umgebungen

Das tritt unter Linux in einer Wayland-Sitzung auf dem KDE-Plasma-Desktop auf.

Bisher wurde es unter Fedora 44, Ubuntu 26.04 und CachyOS bestätigt.

Ein Melder wechselte zu GNOME, woraufhin das Problem verschwand.

## Ursache

Die Zwischenablage scheint zwischen der Wayland-Unterstützung der JetBrains Runtime (Project Wakefield) und JCEF nicht verbunden zu sein, sodass die IDE und JCEF auf getrennte Zwischenablagen schauen.

Die Oberfläche des Plugins wird auf JCEF gezeichnet und ist deshalb davon betroffen.

Dasselbe Symptom wird auch in anderen JetBrains-Plugins gemeldet, die JCEF verwenden.

Da die Zwischenablage bereits abreißt, bevor sie das Plugin erreicht, haben wir bisher keinen Weg gefunden, das allein im Code des Plugins zu beheben.

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
