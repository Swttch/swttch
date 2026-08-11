# Swttch (ex - Claude Code with GUI)

**The Claude Code GUI you know from Cursor and VS Code — now in JetBrains IDEs.**

> **We've been renamed — Claude Code with GUI is now Swttch.**
> It's the same product, by the same developer. We renamed it so we can support a wider range
> of providers beyond Claude Code.

🌐 **English** | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **This plugin is built with this plugin.**
> It is developed right here — in this chat panel, running inside a JetBrains IDE.

## Why this plugin

- **Instantly familiar** — The same screen and feel as Claude Code in Cursor and VS Code. Nothing new to learn.
- **Transparent and safe** — Runs the Claude Code CLI directly. No proxy in between, no silent credential scanning.
- **Quick to improve** — An open-source project that typically fixes reported bugs within a day.

## Features

- **Built on Anthropic's official extension** — Claude Code for VS Code is the official extension built and maintained by Anthropic itself. This plugin takes that official extension as its baseline and brings the same experience to JetBrains.
- **Woven into your IDE** — Send selected code instantly (`Alt+K`), review and apply changes in the IDE diff viewer, and open files and the terminal right in the editor.
- **Place it where you want** — Put the chat in the sidebar tool window or an editor tab, and shape your own workspace.
- **All sessions at a glance** — Browse every conversation in the left panel and open one with a single click.
- **Remote access from other devices** — Pick up on your phone or tablet via a QR code (Cloudflare tunnel).
- **Windows and WSL** — Supports users on PowerShell and WSL environments too.
- **Settings in the GUI** — Manage not only plugin settings but Claude Code's own `.claude` and `.claude.json` config files through the GUI. *(in development)*

## Requirements

- JetBrains IDE 2024.2 or newer
- Claude Code CLI 1.0.0 or newer — latest version recommended, installed and authenticated
- Node.js 18 or newer

## Getting Started

1. Verify the `claude` CLI is installed and authenticated (`claude --version`).
2. Install the plugin from the JetBrains Marketplace.
3. Open it via **Tools > Open Claude Code**, or press `Ctrl+Shift+C`.
4. Start coding with Claude.
