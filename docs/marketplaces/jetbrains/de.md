# Swttch (ex - Claude Code with GUI)

**Die Claude Code GUI, die du aus Cursor und VS Code kennst — jetzt in JetBrains IDEs.**

> **Wir haben einen neuen Namen — aus Claude Code with GUI wird Swttch.**
> Es ist dasselbe Produkt, vom selben Entwickler. Wir haben es umbenannt, weil viele von euch
> sich Unterstützung für mehr Anbieter über Claude Code hinaus gewünscht haben — und das nehmen wir ernst.

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | **Deutsch** | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **Dieses Plugin wird mit diesem Plugin entwickelt.**
> Es entsteht genau hier — in diesem Chat-Panel, das innerhalb einer JetBrains IDE läuft.

## Warum dieses Plugin

- **Sofort vertraut** — Dieselbe Oberfläche und dasselbe Gefühl wie Claude Code in Cursor und VS Code. Nichts Neues zu lernen.
- **Transparent und sicher** — Führt die Claude Code CLI direkt aus. Kein Proxy dazwischen, kein stilles Scannen von Zugangsdaten.
- **Schnelle Verbesserung** — Ein Open-Source-Projekt, das gemeldete Fehler typischerweise innerhalb eines Tages behebt.

## Funktionen

- **Auf Anthropics offizieller Extension aufgebaut** — Claude Code für VS Code ist die offizielle Extension, die von Anthropic selbst entwickelt und gepflegt wird. Dieses Plugin nimmt diese offizielle Extension als Ausgangspunkt und bringt dieselbe Erfahrung zu JetBrains.
- **Tief in die IDE integriert** — Ausgewählten Code sofort senden (`Alt+K`), Änderungen im IDE diff viewer prüfen und übernehmen, Dateien und das Terminal direkt im Editor öffnen.
- **Platzieren, wo es passt** — Den Chat im Sidebar-Toolfenster oder in einem Editor-Tab unterbringen und den eigenen Arbeitsbereich frei gestalten.
- **Alle Sessions auf einen Blick** — Jeden Gesprächsverlauf im linken Panel durchstöbern und mit einem Klick öffnen.
- **Fernzugriff von anderen Geräten** — Auf dem Smartphone oder Tablet per QR-Code weiterarbeiten (Cloudflare-Tunnel).
- **Windows und WSL** — Unterstützt auch Nutzer in PowerShell- und WSL-Umgebungen.
- **Einstellungen in der GUI** — Nicht nur Plugin-Einstellungen, sondern auch Claude Codes eigene `.claude`- und `.claude.json`-Konfigurationsdateien direkt über die GUI verwalten. *(in Entwicklung)*

## Voraussetzungen

- JetBrains IDE 2024.2 oder neuer
- Claude Code CLI 1.0.0 oder neuer — neueste Version empfohlen, installiert und authentifiziert
- Node.js 18 oder neuer

## Erste Schritte

1. Sicherstellen, dass die `claude`-CLI installiert und authentifiziert ist (`claude --version`).
2. Das Plugin über den JetBrains Marketplace installieren.
3. Über **Tools > Open Claude Code** öffnen oder `Ctrl+Shift+C` drücken.
4. Mit Claude loslegen.
