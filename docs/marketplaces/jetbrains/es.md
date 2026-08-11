# Swttch (ex - Claude Code with GUI)

**La interfaz gráfica de Claude Code que conoces de Cursor y VS Code — ahora en JetBrains IDEs.**

> **Hemos cambiado de nombre: Claude Code with GUI ahora es Swttch.**
> Es el mismo producto, del mismo desarrollador. Lo renombramos porque muchos de ustedes nos
> pidieron dar soporte a una gama más amplia de proveedores más allá de Claude Code, y nos lo tomamos en serio.

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | **Español** | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **Este plugin está construido con este mismo plugin.**
> Se desarrolla aquí mismo — en este panel de chat, ejecutándose dentro de un JetBrains IDE.

## Por qué este plugin

- **Familiar desde el primer momento** — La misma pantalla y experiencia que Claude Code en Cursor y VS Code. Sin nada nuevo que aprender.
- **Transparente y seguro** — Ejecuta el Claude Code CLI directamente. Sin proxy intermediario, sin análisis silencioso de credenciales.
- **Mejora rápida** — Un proyecto de código abierto que normalmente corrige los errores reportados en menos de un día.

## Funcionalidades

- **Basado en la extensión oficial de Anthropic** — Claude Code para VS Code es la extensión oficial creada y mantenida por Anthropic. Este plugin toma esa extensión oficial como punto de partida y lleva la misma experiencia a JetBrains.
- **Integrado en tu IDE** — Envía código seleccionado al instante (`Alt+K`), revisa y aplica cambios en el IDE diff viewer, y abre archivos y la terminal directamente en el editor.
- **Colócalo donde prefieras** — Sitúa el chat en el panel lateral o en una pestaña del editor, y configura tu propio espacio de trabajo.
- **Todas las sesiones de un vistazo** — Explora cada conversación en el panel izquierdo y ábrela con un solo clic.
- **Acceso remoto desde otros dispositivos** — Continúa desde tu teléfono o tablet mediante un código QR (túnel Cloudflare).
- **Windows y WSL** — Compatible también con entornos PowerShell y WSL.
- **Configuración desde la GUI** — Gestiona tanto los ajustes del plugin como los archivos de configuración propios de Claude Code (`.claude` y `.claude.json`) desde la interfaz gráfica. *(en desarrollo)*

## Requisitos

- JetBrains IDE 2024.2 o posterior
- Claude Code CLI 1.0.0 o posterior — se recomienda la versión más reciente, instalada y autenticada
- Node.js 18 o posterior

## Primeros pasos

1. Verifica que el CLI de `claude` esté instalado y autenticado (`claude --version`).
2. Instala el plugin desde JetBrains Marketplace.
3. Ábrelo desde **Tools > Open Claude Code** o pulsa `Ctrl+Shift+C`.
4. Empieza a programar con Claude.
