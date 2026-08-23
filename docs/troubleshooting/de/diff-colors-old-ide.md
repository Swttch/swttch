# Die Prüfansicht hat keine Farbe

🌐 [English](../en/diff-colors-old-ide.md) | [한국어](../ko/diff-colors-old-ide.md) | [日本語](../ja/diff-colors-old-ide.md) | [中文](../zh/diff-colors-old-ide.md) | [Español](../es/diff-colors-old-ide.md) | **Deutsch** | [Français](../fr/diff-colors-old-ide.md)

_Zuletzt aktualisiert: 2026-08-24_

Wenn Claude eine Dateiänderung vorschlägt, zeigen wir dir die Änderung — **auf IDE 2025.2 und älter kommt diese Ansicht jedoch ohne Farbe.** Wir konnten das noch nicht umgehen; ein Update der IDE löst es sofort.

## Symptome

Die gesamte Ansicht wird in einer einzigen Farbe gezeichnet.

![Eine Ansicht ohne Farbe — der Code ist durchgehend weiß und geänderte Zeilen haben keinen Hintergrund](../../img/screenshot-diff-colors-missing.png)

- Schlüsselwörter, Zeichenketten und Zahlen sind nicht unterscheidbar — alles ist weiß (oder schwarz)
- **Hinzugefügte und entfernte Zeilen haben keine Hintergrundfarbe.** Keine Farbe zeigt, welche Zeilen sich geändert haben
- Zeilennummern und Trennlinien haben denselben flachen Ton

So sollte es aussehen.

![Eine normale Ansicht — mit Syntaxhervorhebung, hinzugefügte Zeilen mit grünem Hintergrund](../../img/screenshot-diff-colors-ok.png)

Text und Zeilennummern stimmen, und Zustimmen oder Ablehnen funktioniert wie immer. **Es ist nur schwerer zu lesen, nicht kaputt.**

## Ursache

Diese Ansicht wird auf **JCEF** gezeichnet, der Chromium-basierten Browser-Engine in deiner IDE. Ihre Farben wählt sie mit der CSS-Funktion `light-dark()` — eine Zeile enthält die Farbe für das helle und für das dunkle Theme, und der Browser nimmt die passende.

Diese Funktion braucht **Chromium 123 oder neuer**. In der IDE steckt Folgendes:

| IDE-Version | Chromium | Farbe |
|---|---|---|
| 2024.2 – 2025.2 | **122** | fehlt |
| **2025.3 und neuer** | **137** | korrekt |

Eine einzige Version entscheidet. Auf 122 werden die Farbangaben komplett verworfen, und es bleibt nichts übrig, was angewendet werden könnte.

Chromium 122 ist ein Build vom März 2024. Wer länger dieselbe IDE nutzt, hat die Browser-Engine darin genauso alt.

## Was zu tun ist

**Aktualisiere die IDE auf 2025.3 oder neuer.** Wenn möglich, gleich auf die neueste Version.

- **Help → Check for Updates**
- Mit Toolbox: von dort aus aktualisieren

Nach dem Neustart der IDE ist die Farbe wieder da. An den Plugin-Einstellungen musst du nichts ändern.

Deine Version findest du unter **Help → About**.

### Wenn ein Update nicht möglich ist

Du kannst die Änderung auch im **Diff-Viewer der IDE** prüfen. Den zeichnet die IDE selbst, also tritt das Problem dort nicht auf.

Gehe zu **Einstellungen → Diff-Ansicht → Änderungen prüfen in** und wähle **Diff-Viewer der IDE**.

Beachte: Entscheidungen pro Block und das direkte Bearbeiten des Vorschlags gibt es dort nicht — die bieten wir nur in unserer eigenen Ansicht.

## Verwandte Links

### PR in diesem Repository

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### Extern

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — Browser-Unterstützung
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — die mit der IDE gelieferte Runtime; JCEF steckt darin
