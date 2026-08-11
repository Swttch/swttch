# Swttch (ex - Claude Code with GUI)

Die Claude Code GUI, die in Cursor und VS Code beliebt ist, ist jetzt auch in JetBrains IDEs verfügbar.

> **Wir haben einen neuen Namen — aus Claude Code with GUI wird Swttch.**
>
> Dieses Repository ist von `yhk1038/claude-code-gui-jetbrains` nach `Swttch/swttch` umgezogen.
> Bestehende Links und `git clone`-URLs funktionieren weiterhin.
>
> Es ist dasselbe Produkt. Wir haben es umbenannt, weil viele von euch sich Unterstützung für
> mehr Anbieter über Claude Code hinaus gewünscht haben — und das nehmen wir ernst.

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Español](README.es.md) | **Deutsch** | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Highlights

- Bietet die **gleiche UI/UX** wie Claude Code in Cursor/VS Code fur JetBrains IDEs
- Ein Wrapper, der die Claude Code CLI startet — derselbe Ansatz wie die offizielle VS Code-Erweiterung
- **Gesamter Quellcode eigenstandig entworfen und von Grund auf selbst geschrieben** — kein Klon eines anderen Projekts
- Dual-Umgebungs-Architektur fur **unabhangigen Betrieb im Browser/auf Mobilgeraten** ohne JetBrains IDE
- Stellt die sich schnell weiterentwickelnde Claude Code-Erfahrung (Agent Team, Remote Control usw.) als GUI bereit

> Wir arbeiten derzeit intensiv an der Stabilisierung des Dienstes. Wenn Sie einen Fehler melden, losen wir ihn in der Regel innerhalb eines Tages. Ihr Feedback ist sehr willkommen.
>
> Dieses Projekt mochte gemeinsam mit einer globalen Entwickler-Community wachsen. Um die Zusammenarbeit mit moglichst vielen Entwicklern zu ermoglichen, verwenden wir **Englisch als offizielle gemeinsame Sprache**.

## Funktionen

### Streaming-Chat

- Echtzeit-Markdown-Rendering und Syntaxhervorhebung (mit Formel-Rendering)
- Zeigt Claude's Denkprozess (Thinking) in Echtzeit an

### Tool-Call-Karten

- Visuelle Karten fur Datei-Lese-/Schreibvorgange, Bash-Befehle und Suchergebnisse
- Konsistente UI mit Cursor/VS Code

### Berechtigungsverwaltung

- Native Dialoge fur Datei- und Bash-Operationsberechtigungen
- Flexible Berechtigungsrichtlinienkonfiguration in den Einstellungen

### Mehrere Sitzungen

- Verwalten mehrerer Gesprache gleichzeitig mit Tabs
- Schnelles Wechseln uber das Sitzungs-Dropdown
- Vollstandigen Sitzungsverlauf abrufen

### Datei- und Bildanhange

- Dateien und Bilder per Drag-and-Drop oder Auswahl an den Chat anhangen

### Slash-Befehle

- `/clear` — Sitzung zurucksetzen
- `/compact` — Gesprach komprimieren
- Weitere verfugbare Befehle werden dynamisch geladen

### Unterbrechung

- Nachrichten und Tool-Ausfuhrungen wahrend des Streamings sofort stoppen

### Tunnel und Schlafverhinterung

- **Unterstutzung fur Remote-Zugriff von aussen**
  - Erstellt eine von aussen zugangliche URL und stellt einen QR-Code bereit
  - Tunnelt den lokalen Server mit [cloudflared](https://github.com/cloudflare/cloudflared) von Cloudflare (kostenlos, unbegrenzt)
  - Keine Kommunikation mit Dritten ausser dem Cloudflare-Proxy-Server, der Port-Forwarding bereitstellt
  - Community-eigene Implementierung, unabhangig von Claude's Remote Control als nativem offiziellen Feature (kunftige Unterstutzung geplant)

- **Schlafverhinderung**
  - Verhindert den Ruhezustand unter macOS (caffeinate), Linux (systemd-inhibit) und Windows (powercfg)

### Bidirektionale Einstellungssynchronisierung

- Steuert nicht nur Plugin-Einstellungen, sondern auch die originalen Claude Code-Einstellungen (global/lokal) direkt uber das Einstellungsmenu
- Geplante Verbesserung, um die gesamte offizielle Einstellungsdatei-Spezifikation uber die GUI zu steuern
- Geplante Unterstutzung fur die Verwaltung von MCP-Servern, Skills, Agenten und anderen Bereichen unter `.claude` uber die GUI

### Unabhangiger Browser-/Mobilbetrieb

- Kann ohne JetBrains IDE eigenstandig im Browser oder auf Mobilgeraten verwendet werden
- Das Node.js-Backend stellt einen WebSocket-Server bereit, und Browser verbinden sich als Clients
- Kein reines Entwicklungstool, sondern ein unabhangiges Deployment-Ziel — bietet im Browser die gleichen Funktionen wie in der IDE

### Zusatzliche Funktionen

- **Open Claude in Terminal** — Startet Claude uber die Befehlspalette im IDE-Terminal
- **Sitzungs-URL-Routing** — Sitzungen werden auch nach einem IDE-Neustart automatisch wiederhergestellt
- **Single-Process Multi-Project** — Unterstutzt mehrere Projekte gleichzeitig mit einem Backend-Prozess
- **Einstellungen** — CLI-Pfad, Theme, Schriftgroe, Berechtigungsrichtlinie und Log-Level konfigurieren

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

1. Uberprufen Sie, ob die `claude` CLI installiert und authentifiziert ist (`claude --version`).
2. Installieren Sie das Plugin aus dem JetBrains Marketplace.
3. Offnen Sie das Panel uber **Tools > Open Claude Code** oder drucken Sie `Ctrl+Shift+C`.
4. Beginnen Sie mit Claude zu programmieren.

**Tastenkombinationen**

- `Ctrl+Shift+C` — Claude Code Panel offnen
- `Cmd+N` / `Ctrl+N` (Panel fokussiert) — Neuer Sitzungs-Tab

## Beitragen

Beitrage jeder Art sind willkommen — Fehlermeldungen, Funktionsvorschlage, Code, Dokumentation, Ubersetzungen usw.

- **Wo anfangen?** Lesen Sie [CONTRIBUTING.md](../CONTRIBUTING.md) fur Einrichtungsanleitungen und Richtlinien.
- **Suchen Sie nach etwas zum Arbeiten?** Schauen Sie sich Issues mit dem Label [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) an.
- **Planen Sie eine groere Anderung?** Bitte [offnen Sie zuerst ein Issue](https://github.com/Swttch/swttch/issues), um es zu diskutieren.

## Lizenz

Dieses Projekt ist unter der [GNU Affero General Public License v3.0](../LICENSE) lizenziert.
