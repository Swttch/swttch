# Swttch (ex - Claude Code with GUI)

Die Claude Code GUI, die in Cursor und VS Code beliebt ist, ist jetzt auch in JetBrains IDEs verfügbar.

> **Wir haben einen neuen Namen — aus Claude Code with GUI wird Swttch.**
>
> Dieses Repository ist von `yhk1038/claude-code-gui-jetbrains` nach `Swttch/swttch` umgezogen.
> Bestehende Links und `git clone`-URLs funktionieren weiterhin.
>
> Es ist dasselbe Produkt. Wir haben es umbenannt, um mehr Anbieter über Claude Code
> hinaus unterstützen zu können.

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Español](README.es.md) | **Deutsch** | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Highlights

- Bietet die **gleiche UI/UX** wie Claude Code in Cursor/VS Code für JetBrains IDEs
- Ein Wrapper, der die Claude Code CLI startet — derselbe Ansatz wie die offizielle VS Code-Erweiterung
- **Gesamter Quellcode eigenständig entworfen und von Grund auf selbst geschrieben** — kein Klon eines anderen Projekts
- Dual-Umgebungs-Architektur für **unabhängigen Betrieb im Browser/auf Mobilgeräten** ohne JetBrains IDE
- Stellt die sich schnell weiterentwickelnde Claude Code-Erfahrung (Agent Team, Remote Control usw.) als GUI bereit

> Wir arbeiten derzeit intensiv an der Stabilisierung des Dienstes. Wenn Sie einen Fehler melden, lösen wir ihn in der Regel innerhalb eines Tages. Ihr Feedback ist sehr willkommen.
>
> Dieses Projekt möchte gemeinsam mit einer globalen Entwickler-Community wachsen. Um die Zusammenarbeit mit möglichst vielen Entwicklern zu ermöglichen, verwenden wir **Englisch als offizielle gemeinsame Sprache**.

## Funktionen

### Streaming-Chat

- Echtzeit-Markdown-Rendering und Syntaxhervorhebung (mit Formel-Rendering)
- Zeigt Claude's Denkprozess (Thinking) in Echtzeit an

### Tool-Call-Karten

- Visuelle Karten für Datei-Lese-/Schreibvorgänge, Bash-Befehle und Suchergebnisse
- Konsistente UI mit Cursor/VS Code

### Berechtigungsverwaltung

- Native Dialoge für Datei- und Bash-Operationsberechtigungen
- Flexible Berechtigungsrichtlinienkonfiguration in den Einstellungen

### Mehrere Sitzungen

- Verwalten mehrerer Gespräche gleichzeitig mit Tabs
- Schnelles Wechseln über das Sitzungs-Dropdown
- Vollständigen Sitzungsverlauf abrufen

### Datei- und Bildanhange

- Dateien und Bilder per Drag-and-Drop oder Auswahl an den Chat anhängen

### Slash-Befehle

- `/clear` — Sitzung zurücksetzen
- `/compact` — Gespräch komprimieren
- Weitere verfügbare Befehle werden dynamisch geladen

### Unterbrechung

- Nachrichten und Tool-Ausführungen während des Streamings sofort stoppen

### Tunnel und Schlafverhinderung

- **Unterstützung für Remote-Zugriff von außen**
  - Erstellt eine von außen zugängliche URL und stellt einen QR-Code bereit
  - Tunnelt den lokalen Server mit [cloudflared](https://github.com/cloudflare/cloudflared) von Cloudflare (kostenlos, unbegrenzt)
  - Keine Kommunikation mit Dritten außer dem Cloudflare-Proxy-Server, der Port-Forwarding bereitstellt
  - Community-eigene Implementierung, unabhängig von Claude's Remote Control als nativem offiziellen Feature (künftige Unterstützung geplant)

- **Schlafverhinderung**
  - Verhindert den Ruhezustand unter macOS (caffeinate), Linux (systemd-inhibit) und Windows (powercfg)

### Bidirektionale Einstellungssynchronisierung

- Steuert nicht nur Plugin-Einstellungen, sondern auch die originalen Claude Code-Einstellungen (global/lokal) direkt über das Einstellungsmenü
- Geplante Verbesserung, um die gesamte offizielle Einstellungsdatei-Spezifikation über die GUI zu steuern
- Geplante Unterstützung für die Verwaltung von MCP-Servern, Skills, Agenten und anderen Bereichen unter `.claude` über die GUI

### Unabhängiger Browser-/Mobilbetrieb

- Kann ohne JetBrains IDE eigenständig im Browser oder auf Mobilgeräten verwendet werden
- Das Node.js-Backend stellt einen WebSocket-Server bereit, und Browser verbinden sich als Clients
- Kein reines Entwicklungstool, sondern ein unabhängiges Deployment-Ziel — bietet im Browser die gleichen Funktionen wie in der IDE

### Zusätzliche Funktionen

- **Open Claude in Terminal** — Startet Claude über die Befehlspalette im IDE-Terminal
- **Sitzungs-URL-Routing** — Sitzungen werden auch nach einem IDE-Neustart automatisch wiederhergestellt
- **Single-Process Multi-Project** — Unterstützt mehrere Projekte gleichzeitig mit einem Backend-Prozess
- **Einstellungen** — CLI-Pfad, Theme, Schriftgröße, Berechtigungsrichtlinie und Log-Level konfigurieren

<details>
<summary>Weitere Screenshots</summary>

**Willkommensbildschirm**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**Einstellungsbereich**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## Anforderungen

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0 (installiert und authentifiziert)
- Node.js >= 18

## Schnellstart

1. Überprüfen Sie, ob die `claude` CLI installiert und authentifiziert ist (`claude --version`).
2. Installieren Sie das Plugin aus dem JetBrains Marketplace.
3. Öffnen Sie das Panel über **Tools > Open Claude Code** oder drücken Sie `Ctrl+Shift+C`.
4. Beginnen Sie mit Claude zu programmieren.

**Tastenkombinationen**

- `Ctrl+Shift+C` — Claude Code Panel öffnen
- `Cmd+N` / `Ctrl+N` (Panel fokussiert) — Neuer Sitzungs-Tab

## Fehlerbehebung

Häufig auftretende Probleme, die wir noch nicht selbst beheben konnten, für die es aber eine bekannte Lösung gibt, sind unter **[docs/troubleshooting](troubleshooting/de/README.md)** gesammelt — jeweils mit Symptomen, Ursache, Lösung und Links zu den zugehörigen Issues.

- [Wayland-Zwischenablage](troubleshooting/de/wayland-clipboard.md) — wenn das Einfügen in das Chat-Eingabefeld unter Linux · Wayland · KDE Plasma fehlschlägt
- [JCEF in Android Studio](troubleshooting/de/android-studio-jcef.md) — wenn Android Studio ein Hinweispanel oder eine Ausnahme statt der Chat-Oberfläche oder ein leeres Fenster zeigt

Steht Ihr Problem nicht in der Liste, [eröffnen Sie bitte ein Issue](https://github.com/Swttch/swttch/issues/new/choose).

## Beitragen

Beiträge jeder Art sind willkommen — Fehlermeldungen, Funktionsvorschläge, Code, Dokumentation, Übersetzungen usw.

- **Wo anfangen?** Lesen Sie [CONTRIBUTING.md](../CONTRIBUTING.md) für Einrichtungsanleitungen und Richtlinien.
- **Suchen Sie nach etwas zum Arbeiten?** Schauen Sie sich Issues mit dem Label [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) an.
- **Planen Sie eine größere Änderung?** Bitte [öffnen Sie zuerst ein Issue](https://github.com/Swttch/swttch/issues), um es zu diskutieren.

## Lizenz

Dieses Projekt ist unter der [GNU Affero General Public License v3.0](../LICENSE) lizenziert.
