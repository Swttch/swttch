# Mit gesetztem CCG_HOME wirken Einstellungen und gespeicherte Konten nach dem Update zurückgesetzt

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | **Deutsch** | [Français](../fr/ccg-home-data-location.md)

_Zuletzt aktualisiert: 2026-11-10_

**Das betrifft nur Sie, wenn Sie die Umgebungsvariable `CCG_HOME` selbst gesetzt haben.** Wenn nicht, ändert sich für Sie nichts, und Sie können hier aufhören zu lesen.

Bis einschließlich v0.36.1 haben drei Arten von Daten `CCG_HOME` ignoriert und blieben im Standardordner `~/.claude-code-gui`, auch wenn `CCG_HOME` auf einen anderen Ordner zeigte. Ab dem Release nach v0.36.1 folgen diese drei Arten `CCG_HOME`, so wie die übrigen Daten des Plugins schon. Deshalb öffnet das Plugin jetzt den Ordner, auf den `CCG_HOME` zeigt, findet dort Ihre alten Dateien nicht und startet mit den Standardwerten. **Es wurde nichts gelöscht.** Die alten Dateien liegen weiter im Standardordner, und das Kopieren wie unten beschrieben behebt das Problem.

## Symptome

- Nach dem Update sind die Einstellungen wieder auf den Standardwerten (Design, Schriftgröße usw.)
- `swttch account` (oder `ccg account`) meldet, dass es keine gespeicherten Konten gibt, obwohl Sie vorher welche gespeichert haben
- Jede andere Stelle, die gespeicherte Konten zeigt, ist leer

## So prüfen Sie, ob Sie betroffen sind

Führen Sie dies in dem Terminal aus, in dem Sie die IDE oder das Plugin starten:

| System | Befehl | Nicht betroffen, wenn die Ausgabe |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | leer ist oder derselbe Ordner wie `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | leer ist oder derselbe Ordner wie `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | leer ist (cmd gibt den Text `%CCG_HOME%` unverändert aus, wenn die Variable nicht gesetzt ist) oder derselbe Ordner wie `%USERPROFILE%\.claude-code-gui` |

Zeigt die Ausgabe einen anderen Ordner, sind Sie betroffen.

## Was verschoben wurde

| Datei oder Ordner (im alten Standardordner) | Inhalt |
|---|---|
| `settings.js` | Ihre Plugin-Einstellungen |
| `accounts.json` und der Ordner `accounts` | Die Claude-Konten, die Sie zum schnellen Wechseln gespeichert haben, **einschließlich ihrer Anmeldedaten** |
| `cli-registry` | Eine kurzlebige Liste laufender Claude-Prozesse. **Nichts zu tun**, sie wird von selbst neu aufgebaut |

## So beheben Sie es

Tun Sie das **bevor** Sie in der aktualisierten Version eine Einstellung ändern oder ein Konto speichern. Kopieren überschreibt, was im neuen Ordner liegt (siehe "Gut zu wissen").

### 1. Plugin beenden

Schließen Sie den Plugin-Tab in der IDE oder beenden Sie die IDE. Wenn Sie die Browser-Version nutzen, führen Sie `swttch stop` aus.

### 2. Dateien in den Ordner kopieren, auf den `CCG_HOME` zeigt

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
cp -p ~/.claude-code-gui/settings.js "$CCG_HOME/"
cp -pR ~/.claude-code-gui/accounts.json ~/.claude-code-gui/accounts "$CCG_HOME/"
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
Copy-Item "$env:USERPROFILE\.claude-code-gui\settings.js" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts.json" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts" $env:CCG_HOME -Recurse -ErrorAction SilentlyContinue
```

Eine Meldung "nicht gefunden" für eine Datei, die Sie nie hatten (zum Beispiel, weil Sie nie ein Konto gespeichert haben), ist unproblematisch.

### 3. Plugin wieder starten

Ihre Einstellungen und Ihre gespeicherten Konten sind wieder da. `swttch account` listet sie auf.

### 4. Alte Kopien löschen (optional)

Wenn Sie geprüft haben, dass alles wieder da ist, können Sie `settings.js`, `accounts.json` und den Ordner `accounts` in `~/.claude-code-gui` löschen. Die Kontodateien enthalten Anmeldedaten, deshalb ist der einzige Grund zum Löschen, keine überflüssigen Kopien herumliegen zu lassen. Die alten Kopien braucht nichts mehr.

## Gut zu wissen

- **Kopieren überschreibt.** Wenn Sie nach dem Update schon eine Einstellung geändert oder ein Konto gespeichert haben, liegt das im neuen Ordner, und die Kopie ersetzt es durch die alte Fassung. Kopieren Sie dann nur die Datei, die Ihnen fehlt. Fehlt nur ein Konto, können Sie sich auch mit `claude` erneut anmelden und `swttch account save` ausführen
- Sie müssen `CCG_HOME` nicht anders setzen. Geändert hat sich nur, wo die Daten gelesen werden
- Mit den obigen Befehlen (`cp -p`) behalten die Dateien ihre Berechtigung nur für den Eigentümer. Erweitern Sie die Berechtigung von `accounts.json` und dem Ordner `accounts` nicht
- Ihre Prompts, Projekte und hochgeladenen Dateien waren nie betroffen. Sie folgten schon vorher `CCG_HOME`

## Verwandte Links

### Dokumente in diesem Repository

- [Prompt-Bibliothek, wo die Prompts liegen](../../features/064-prompt_library/en.md) — beschreibt, wie `CCG_HOME` den ganzen Datenordner verschiebt (auf Englisch)
- [Beliebige Dateitypen anhängen, wo die Kopien liegen](../../features/085-attach_any_file_type/en.md) — auch die hochgeladenen Kopien folgen `CCG_HOME` (auf Englisch)
