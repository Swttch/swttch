# Swttch (ex - Claude Code with GUI)

**L'interface graphique Claude Code que vous connaissez dans Cursor et VS Code — désormais disponible dans les IDE JetBrains.**

> **Nous avons changé de nom — Claude Code with GUI devient Swttch.**
> C'est le même produit, du même développeur. Nous l'avons renommé afin de pouvoir prendre
> en charge davantage de fournisseurs au-delà de Claude Code.

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | **Français**

> **Ce plugin est développé avec ce plugin lui-même.**
> Il est créé ici même — dans ce panneau de chat, au sein d'un IDE JetBrains.

## Pourquoi ce plugin

- **Familier dès le premier instant** — La même interface et la même expérience que Claude Code dans Cursor et VS Code. Rien de nouveau à apprendre.
- **Transparent et sécurisé** — Exécute le Claude Code CLI directement. Aucun proxy intermédiaire, aucune lecture silencieuse des identifiants.
- **Amélioration rapide** — Un projet open-source qui corrige généralement les bugs signalés en moins d'un jour.

## Fonctionnalités

- **Fondé sur l'extension officielle d'Anthropic** — Claude Code pour VS Code est l'extension officielle développée et maintenue par Anthropic. Ce plugin prend cette extension officielle comme base et apporte la même expérience à JetBrains.
- **Intégré à votre IDE** — Envoyez du code sélectionné instantanément (`Alt+K`), examinez et appliquez les modifications dans l'IDE diff viewer, et ouvrez des fichiers ainsi que le terminal directement dans l'éditeur.
- **Placez-le où vous le souhaitez** — Installez le chat dans le panneau latéral ou dans un onglet de l'éditeur, et aménagez votre espace de travail à votre guise.
- **Toutes les sessions en un coup d'œil** — Parcourez chaque conversation dans le panneau de gauche et ouvrez-en une d'un simple clic.
- **Accès à distance depuis d'autres appareils** — Reprenez votre session sur votre téléphone ou tablette via un QR code (tunnel Cloudflare).
- **Windows et WSL** — Compatible avec les environnements PowerShell et WSL.
- **Paramètres dans l'interface graphique** — Gérez non seulement les réglages du plugin, mais aussi les fichiers de configuration `.claude` et `.claude.json` de Claude Code directement depuis l'interface. *(en cours de développement)*

## Prérequis

- IDE JetBrains 2024.2 ou version ultérieure
- Claude Code CLI 1.0.0 ou version ultérieure — la dernière version est recommandée, installée et authentifiée
- Node.js 18 ou version ultérieure

## Démarrage rapide

1. Vérifiez que le CLI `claude` est installé et authentifié (`claude --version`).
2. Installez le plugin depuis le JetBrains Marketplace.
3. Ouvrez-le via **Tools > Open Claude Code**, ou appuyez sur `Ctrl+Shift+C`.
4. Commencez à coder avec Claude.
