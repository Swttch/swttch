# Swttch (ex - Claude Code with GUI)

La même interface Claude Code GUI que vous aimez dans Cursor et VS Code, maintenant disponible dans les IDEs JetBrains.

> **Nous avons changé de nom — Claude Code with GUI devient Swttch.**
>
> Ce dépôt a été déplacé de `yhk1038/claude-code-gui-jetbrains` vers `Swttch/swttch`.
> Vos liens existants et les URLs `git clone` continuent de fonctionner.
>
> C'est le même produit. Nous l'avons renommé parce que beaucoup d'entre vous nous ont demandé
> de prendre en charge davantage de fournisseurs au-delà de Claude Code, et nous le prenons au sérieux.

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | [Español](README.es.md) | [Deutsch](README.de.md) | **Français**

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Points forts

- Fournit la **même UI/UX** que Claude Code dans Cursor/VS Code, dans les IDEs JetBrains
- Wrapper qui lance le Claude Code CLI — la même approche que l'extension VS Code officielle
- **Tout le code source a été conçu et écrit de zéro** — ce n'est pas un clone d'un autre projet
- Architecture double environnement permettant une **utilisation autonome depuis un navigateur ou un mobile**, sans IDE JetBrains
- Offre une interface graphique pour l'expérience Claude Code en évolution rapide (Agent Team, Remote Control, etc.)

> Nous consacrons actuellement beaucoup d'efforts à la stabilisation du service. Si vous signalez un bug, nous le résolvons généralement en moins d'un jour en moyenne. Vos retours sont très appréciés.
>
> Ce projet aspire à grandir aux côtés d'une communauté mondiale de développeurs. Nous adoptons **l'anglais comme langue commune officielle** afin de maximiser les opportunités de collaboration avec le plus grand nombre possible de développeurs.

## Fonctionnalités

### Chat en streaming

- Rendu Markdown en temps réel avec coloration syntaxique (support du rendu de formules mathématiques)
- Affiche le processus de réflexion (thinking) de Claude en temps réel

### Cartes d'appels d'outils

- Cartes visuelles pour les lectures/écritures de fichiers, commandes Bash et résultats de recherche
- Interface cohérente avec Cursor/VS Code

### Gestion des permissions

- Dialogues natifs pour les permissions d'accès aux fichiers et opérations Bash
- Configuration flexible de la politique de permissions dans les paramètres

### Sessions multiples

- Gestion de plusieurs conversations simultanément avec support des onglets
- Basculement rapide via le dropdown de session
- Consultation de l'historique complet des sessions

### Fichiers et images en pièce jointe

- Glisser-déposer ou sélection de fichiers et d'images à joindre au chat

### Commandes slash

- `/clear` — Réinitialiser la session
- `/compact` — Compacter la conversation
- Chargement dynamique des autres commandes disponibles

### Interruption

- Arrêt immédiat du streaming et de l'exécution des outils en cours

### Tunnel et prevention de mise en veille

- **Support de la connexion distante depuis l'extérieur**
  - Génération d'une URL accessible depuis l'extérieur et fourniture d'un QR Code
  - Tunneling du serveur local via [cloudflared](https://github.com/cloudflare/cloudflared) de Cloudflare (gratuit, illimité)
  - Aucune communication tierce en dehors du serveur proxy Cloudflare fournissant la redirection de port
  - Il s'agit d'une implémentation communautaire indépendante, sans lien avec la fonctionnalité native officielle Remote Control de Claude (support prévu à l'avenir)

- **Prevention de mise en veille**
  - Prevention de mise en veille sur macOS (caffeinate), Linux (systemd-inhibit) et Windows (powercfg)

### Synchronisation bidirectionnelle des paramètres

- Contrôle direct depuis le menu des paramètres, tant des paramètres du plugin que des paramètres originaux de Claude Code (globaux/locaux)
- Amélioration prévue pour permettre le contrôle de l'intégralité des spécifications officielles des fichiers de configuration via l'interface graphique
- Support prévu pour la gestion via l'interface graphique des domaines gérés par `.claude` : serveurs MCP, skills, agents, etc.

### Utilisation autonome depuis un navigateur ou un mobile

- Utilisable seul depuis un navigateur ou un mobile, sans IDE JetBrains
- Le backend Node.js fournit un serveur WebSocket auquel le navigateur se connecte en tant que client
- Cible de déploiement autonome et non uniquement pour le développement — fournit les mêmes fonctionnalités que l'environnement IDE dans le navigateur

### Fonctionnalités supplémentaires

- **Open Claude in Terminal** — Lancement de Claude depuis la palette de commandes vers le terminal IDE
- **Routage d'URL de session** — La session est automatiquement restaurée même après le redémarrage de l'IDE
- **Multi-projets en processus unique** — Prise en charge simultanée de plusieurs projets avec un seul processus backend
- **Paramètres** — Configuration du chemin CLI, du thème, de la taille de la police, de la politique de permissions et du niveau de journalisation

<details>
<summary>Plus de captures d'écran</summary>

**Ecran d'accueil**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**Panneau des paramètres**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## Prérequis

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0 (installé et authentifié)
- Node.js >= 18

## Démarrage rapide

1. Vérifiez que le CLI `claude` est installé et authentifié (`claude --version`).
2. Installez le plugin depuis la JetBrains Marketplace.
3. Ouvrez le panneau via **Tools > Open Claude Code** ou appuyez sur `Ctrl+Shift+C`.
4. Commencez à coder avec Claude.

**Raccourcis clavier**

- `Ctrl+Shift+C` — Ouvrir le panneau Claude Code
- `Cmd+N` / `Ctrl+N` (panneau en focus) — Nouvel onglet de session

## Contribution

Toutes les formes de contribution sont les bienvenues — rapports de bugs, suggestions de fonctionnalités, code, documentation, traductions, etc.

- **Pour commencer ?** Consultez les instructions de configuration et les directives dans [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Vous cherchez quelque chose sur quoi travailler ?** Consultez les issues avec le label [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue).
- **Vous planifiez un changement important ?** Veuillez d'abord [ouvrir une issue](https://github.com/Swttch/swttch/issues) pour en discuter.

## Licence

Ce projet est concédé sous la [Licence Publique Générale Affero GNU v3.0](../LICENSE).
