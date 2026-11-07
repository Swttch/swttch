# Im Plugin erstellte Sitzungen erscheinen nicht im Code-Tab von Claude Desktop

🌐 [English](../en/desktop-session-import.md) | [한국어](../ko/desktop-session-import.md) | [日本語](../ja/desktop-session-import.md) | [中文](../zh/desktop-session-import.md) | [Español](../es/desktop-session-import.md) | **Deutsch** | [Français](../fr/desktop-session-import.md)

_Zuletzt aktualisiert: 2026-11-07_

Eine im Plugin erstellte Sitzung erscheint nicht von selbst im Code-Tab von Claude Desktop. In die Gegenrichtung, also eine in Desktop erstellte Sitzung im Plugin zu öffnen, funktioniert von Anfang an. Die Datei, aus der Desktop seine Liste aufbaut, ist nicht dokumentiert, daher können wir sie nicht für Sie beschreiben. Möglich ist aber, **den Sitzungsimport von Desktop einmal auszuführen**. Ab v0.36.0 werden neue Sitzungen so gestartet, dass dieser Import sie erkennt, und die davor erstellten Sitzungen lassen sich mit einer Schaltfläche in den Einstellungen vorbereiten.

## Symptome

- Eine Sitzung, die Sie im Plugin genutzt haben, fehlt in der Liste links im Code-Tab von Claude Desktop
- Im selben Ordner öffnet `claude --resume` im Terminal diese Sitzung. Die Unterhaltung ist noch da
- In Desktop gestartete Sitzungen erscheinen dagegen in der Sitzungsliste des Plugins

## Ursache

Desktop zeigt die Unterhaltungsdateien nicht unmittelbar an, sondern baut seine Liste aus einem eigenen Index auf. Eine Sitzung, die nicht im Index steht, erscheint nicht in der Liste, auch wenn ihre Datei vorhanden ist.

Sitzungen in diesen Index aufnehmen kann der Menüpunkt **CLI-Sitzungen von Claude Code importieren…** von Desktop. Dieser Import überspringt aber jede Sitzung, deren Aufzeichnung `sdk-cli` enthält. Das Plugin startet Claude auf dieselbe nicht interaktive Weise wie SDK-Werkzeuge, daher stand früher in der Aufzeichnung jeder Sitzung `sdk-cli`.

Ab v0.36.0 startet das Plugin neue Sitzungen unter einem eigenen Namen: `swttch-jetbrains` in einer IDE und `swttch-standalone` im Browser (`ccg`). Der Import von Desktop akzeptiert diese Namen.

## So lösen Sie es

### 1. Wenn Sie Sitzungen von vor v0.36.0 haben: im Plugin vorbereiten

**Einstellungen → Allgemein → Sitzungen für den Import in Claude Desktop vorbereiten → Vorbereiten**

- Es werden nur die Sitzungen des geöffneten Ordners vorbereitet. Für einen anderen Ordner öffnen Sie diesen und klicken erneut
- „Vorbereitete Sitzungen: N“ bedeutet, dass es fertig ist
- Eine Sitzung, die gerade läuft, bleibt unberührt. Sehen Sie „Sitzungen, die wegen laufender Nutzung unverändert blieben“, schließen Sie diese Sitzungen und klicken erneut
- Wurden alle Ihre Sitzungen nach v0.36.0 erstellt, überspringen Sie diesen Schritt

### 2. In Claude Desktop importieren

Wählen Sie im Menü **Hilfe → Fehlerbehebung → CLI-Sitzungen von Claude Code importieren…**.

Ein Dialog fragt „N Claude Code-Sitzungen importieren?“. Klicken Sie auf **Sitzungen importieren**. Wenn der Import abgeschlossen ist, finden Sie die Sitzungen in der Liste des Code-Tabs.

- Der Import übernimmt **auf einmal** alle Sitzungen, die noch nicht in der Liste stehen. Sie müssen ihn nicht pro Sitzung ausführen. Führen Sie ihn gelegentlich aus, nachdem Sie mehrere Sitzungen im Plugin erstellt haben
- **Abbrechen** im Dialog importiert nichts
- Diese Menüposition wurde in der macOS-Desktop-App geprüft. Unter Windows und Linux kann sie abweichen

### 3. Weiterarbeiten

Eine Nachricht, die Sie in einer importierten Sitzung senden, wird an dieselbe Unterhaltungsaufzeichnung angehängt. Öffnen Sie die Sitzung im Plugin erneut, sehen Sie auch die Unterhaltung aus Desktop.

Führen Sie eine Sitzung nicht an beiden Orten **gleichzeitig** aus. Zwei Programme würden in dieselbe Aufzeichnungsdatei schreiben. Beenden Sie die Arbeit an einem Ort und machen Sie dann am anderen weiter.

## Gut zu wissen

- Importiert werden nur Sitzungen in **Ordnern, denen Sie vertrauen**. „Keine CLI-Sitzungen zum Importieren“ bedeutet, dass die importierbaren Sitzungen bereits in Ihrer Liste stehen, zuvor gelöscht wurden oder in Ordnern liegen, denen Claude noch nicht vertraut. Erscheint eine Plugin-Sitzung nicht, prüfen Sie zuerst, ob Sie Schritt 1 ausgeführt haben
- Eine Sitzung, die Sie in Desktop **gelöscht** haben, wird nicht erneut importiert
- Eine importierte Sitzung behält ihren Verlauf und ihren Berechtigungsmodus (außer dem Modus zum Umgehen von Berechtigungen), aber nicht den Archivstatus oder erteilte Berechtigungen
- Die Schaltfläche in Schritt 1 ersetzt nur das `sdk-cli` in jeder Zeile der Aufzeichnungsdatei durch den neuen Namen und lässt alles andere unverändert. Eine Sitzung, die ein anderes SDK-Werkzeug im selben Ordner erstellt hat, wird mit geändert
- Wir schreiben nicht in die eigenen Dateien von Desktop, um Sitzungen in dessen Liste zu bringen. Diese Dateien sind nicht dokumentiert, und ein Desktop-Update könnte das unbemerkt zerstören

### Wenn es trotzdem nicht klappt

Im selben Ordner können Sie die Sitzung mit `claude --resume` im Terminal fortsetzen.

## Verwandte Links

### Issue in diesem Repository

- [#647 — Sessions created in the plugin don't appear in the Claude Desktop Code tab](https://github.com/Swttch/swttch/issues/647)

### Dokument in diesem Repository

- [Ausnahme von einem Grundsatz: `CLAUDE_CODE_ENTRYPOINT` für den Sitzungsimport](../../principle-exceptions/647-entrypoint-for-desktop-import.md) — warum dieser Weg gewählt wurde und was geprüft wurde (auf Koreanisch)
