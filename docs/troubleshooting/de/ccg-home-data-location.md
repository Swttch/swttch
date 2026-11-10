# Mit gesetztem CCG_HOME wirken gespeicherte Konten, Lizenz und weitere Daten nach dem Update zurückgesetzt

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | **Deutsch** | [Français](../fr/ccg-home-data-location.md)

_Zuletzt aktualisiert: 2026-11-10_

**Das betrifft nur Sie, wenn Sie die Umgebungsvariable `CCG_HOME` selbst gesetzt haben.** Wenn nicht, ändert sich für Sie nichts, und Sie können hier aufhören zu lesen.

Bis einschließlich v0.36.1 haben mehrere Arten von Daten `CCG_HOME` ignoriert und blieben im Standardordner `~/.claude-code-gui`, auch wenn `CCG_HOME` auf einen anderen Ordner zeigte. Ab dem Release nach v0.36.1 folgen sie `CCG_HOME`, so wie Ihre Prompts, Projekte und hochgeladenen Dateien es schon vorher taten. Deshalb öffnet das Plugin jetzt den Ordner, auf den `CCG_HOME` zeigt, findet dort Ihre alten Dateien nicht und beginnt bei null. **Es wurde nichts gelöscht.** Die alten Dateien liegen weiter im Standardordner, und das Kopieren wie unten beschrieben behebt das Problem.

## Symptome

- `swttch account` (oder `ccg account`) meldet, dass es keine gespeicherten Konten gibt, obwohl Sie vorher welche gespeichert haben
- Die Sponsoren-Funktionen sind aus, als hätten Sie keinen Lizenzschlüssel
- Die Frage nach dem Senden anonymer Nutzungsdaten erscheint erneut, als hätten Sie nie geantwortet
- Die Nachrichten, die Sie geplant hatten, fehlen in der Liste

## So prüfen Sie, ob Sie betroffen sind

Führen Sie dies in dem Terminal aus, in dem Sie die IDE oder das Plugin starten:

| System | Befehl | Nicht betroffen, wenn die Ausgabe |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | leer ist oder derselbe Ordner wie `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | leer ist oder derselbe Ordner wie `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | leer ist (cmd gibt den Text `%CCG_HOME%` unverändert aus, wenn die Variable nicht gesetzt ist) oder derselbe Ordner wie `%USERPROFILE%\.claude-code-gui` |

Zeigt die Ausgabe einen anderen Ordner, sind Sie betroffen.

## Was verschoben wurde

| Datei oder Ordner (im alten Standardordner) | Inhalt | Was zu tun ist |
|---|---|---|
| `accounts.json` und der Ordner `accounts` | Die Claude-Konten, die Sie zum schnellen Wechseln gespeichert haben, **einschließlich ihrer Anmeldedaten** | Kopieren |
| `license.json` | Ihr Sponsoren-Lizenzschlüssel | Kopieren |
| `profile.json` | Ihre Antwort zu anonymen Nutzungsdaten und die zufällige Kennung dieser Installation | Kopieren |
| `scheduled-messages.json` | Von Ihnen geplante Nachrichten | Kopieren |
| Ordner `workflow-agents` | Die Agentennamen, die ein beendeter Workflow nach dem erneuten Öffnen eines Chats zeigt | Kopieren, wenn Sie sie behalten möchten |
| Ordner `account-pool-recovery` und `cli-registry`, `logs/lifecycle.log`, Ordner `bin` | Kurzlebige Notizen, eine Liste laufender Claude-Prozesse, ein Startprotokoll, das heruntergeladene Tunnel-Werkzeug | Nichts, sie werden von selbst neu angelegt oder erneut heruntergeladen |

## Was nicht verschoben wurde

- **`settings.js`** (Ihre Plugin-Einstellungen) bleibt absichtlich im Standardordner. Das IDE-Plugin liest und schreibt dieselbe Datei und kennt `CCG_HOME` nicht, deshalb müssen beide Seiten sie weiter nutzen. Ihre Einstellungen werden durch diese Änderung nicht zurückgesetzt
- **`auth-secret`**, das Geheimnis, das die Verbindung zwischen der Chat-Seite und ihrem Backend schützt, bleibt aus demselben Grund ebenfalls: Der Befehl `swttch` und das IDE-Plugin teilen es sich
- Ihre Prompts, Projekte, hochgeladenen Dateien, gesendeten Dateien und Nutzungszahlen folgten schon vorher `CCG_HOME` und sind nicht betroffen

## So beheben Sie es

Tun Sie das **bevor** Sie in der aktualisierten Version ein Konto speichern, eine Lizenz eingeben oder sonst etwas ändern. Kopieren überschreibt, was im neuen Ordner liegt (siehe "Gut zu wissen").

### 1. Plugin beenden

Schließen Sie den Plugin-Tab in der IDE oder beenden Sie die IDE. Wenn Sie die Browser-Version nutzen, führen Sie `swttch stop` aus.

### 2. Dateien in den Ordner kopieren, auf den `CCG_HOME` zeigt

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
for f in accounts.json accounts license.json profile.json scheduled-messages.json workflow-agents; do
  [ -e ~/.claude-code-gui/$f ] && cp -pR ~/.claude-code-gui/$f "$CCG_HOME/"
done
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
foreach ($f in 'accounts.json','accounts','license.json','profile.json','scheduled-messages.json','workflow-agents') {
  $src = Join-Path $env:USERPROFILE ".claude-code-gui\$f"
  if (Test-Path $src) { Copy-Item $src $env:CCG_HOME -Recurse -Force }
}
```

Eine Datei, die Sie nie hatten (zum Beispiel, weil Sie nie eine Nachricht geplant haben), wird einfach übersprungen.

### 3. Plugin wieder starten

Ihre gespeicherten Konten, die Lizenz, die Antwort zu den Nutzungsdaten und die geplanten Nachrichten sind wieder da. `swttch account` listet die Konten auf.

### 4. Alte Kopien löschen (optional)

Wenn Sie geprüft haben, dass alles wieder da ist, können Sie die kopierten Dateien aus `~/.claude-code-gui` löschen. Behalten Sie `settings.js` und `auth-secret`, die dort weiter benutzt werden. `accounts.json`, der Ordner `accounts` und `license.json` enthalten Anmeldedaten und Ihren Lizenzschlüssel, deshalb ist der einzige Grund zum Löschen, keine überflüssigen Kopien herumliegen zu lassen. Die alten Kopien braucht nichts mehr.

## Gut zu wissen

- **Kopieren überschreibt.** Wenn Sie nach dem Update schon ein Konto gespeichert, eine Lizenz eingegeben oder die Frage zu den Nutzungsdaten beantwortet haben, liegt das im neuen Ordner, und die Kopie ersetzt es durch die alte Fassung. Kopieren Sie dann nur das Element, das Ihnen fehlt. Fehlt nur ein Konto, können Sie sich auch mit `claude` erneut anmelden und `swttch account save` ausführen. Ein verlorener Lizenzschlüssel lässt sich erneut eingeben
- Sie müssen `CCG_HOME` nicht anders setzen. Geändert hat sich nur, wo die Daten gelesen werden
- Mit den obigen Befehlen (`cp -p`) behalten die Dateien ihre Berechtigung nur für den Eigentümer. Erweitern Sie die Berechtigung von `accounts.json`, dem Ordner `accounts` und `license.json` nicht

## Verwandte Links

### Dokumente in diesem Repository

- [Prompt-Bibliothek, wo die Prompts liegen](../../features/064-prompt_library/en.md) — beschreibt, wie `CCG_HOME` den ganzen Datenordner verschiebt (auf Englisch)
- [Beliebige Dateitypen anhängen, wo die Kopien liegen](../../features/085-attach_any_file_type/en.md) — auch die hochgeladenen Kopien folgen `CCG_HOME` (auf Englisch)
