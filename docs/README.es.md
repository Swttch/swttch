# Swttch (ex - Claude Code with GUI)

La misma interfaz gráfica de Claude Code que amas en Cursor y VS Code, ahora disponible en IDEs de JetBrains.

> **Hemos cambiado de nombre: Claude Code with GUI ahora es Swttch.**
>
> Este repositorio se trasladó de `yhk1038/claude-code-gui-jetbrains` a `Swttch/swttch`.
> Tus enlaces existentes y las URLs de `git clone` siguen funcionando.
>
> Es el mismo producto. Lo renombramos para poder dar soporte a una gama más amplia
> de proveedores más allá de Claude Code.

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md) | **Español** | [Deutsch](README.de.md) | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Destacados

- Proporciona la **misma UI/UX** que Claude Code en Cursor y VS Code dentro de los IDEs de JetBrains
- Un wrapper que ejecuta el Claude Code CLI — el mismo enfoque que la extensión oficial de VS Code
- **Todo el código fuente fue diseñado y escrito desde cero** — no es un clon de ningún otro proyecto
- Arquitectura de entorno dual que permite **ejecución independiente desde el navegador o móvil**, además de los IDEs de JetBrains
- Ofrece como GUI la experiencia Claude Code en rápida evolución (Agent Team, Remote Control, etc.)

> Actualmente dedicamos un gran esfuerzo a estabilizar el servicio. Si reportas un error, normalmente lo resolvemos en un promedio de 1 día. Agradecemos mucho tu retroalimentación.
>
> Este proyecto aspira a crecer junto con una comunidad global de desarrolladores. Adoptamos el **inglés como idioma común oficial** para maximizar las oportunidades de colaboración con la mayor cantidad posible de desarrolladores.

## Características

### Chat en Streaming

- Renderizado de Markdown en tiempo real con resaltado de sintaxis (soporte de renderizado de fórmulas matemáticas)
- Muestra el proceso de pensamiento (thinking) de Claude en tiempo real

### Tarjetas de Llamadas de Herramientas

- Muestra lecturas/escrituras de archivos, comandos Bash y resultados de búsqueda como tarjetas visuales
- Interfaz consistente con Cursor y VS Code

### Gestión de Permisos

- Diálogos nativos para permisos de operaciones de archivos y Bash
- Configuración flexible de políticas de permisos en los ajustes

### Múltiples Sesiones

- Administra múltiples conversaciones simultáneamente con soporte de pestañas
- Cambia rapidamente entre sesiones con el menú desplegable de sesiones
- Consulta el historial completo de sesiones

### Adjuntar Archivos e Imágenes

- Adjunta archivos e imágenes al chat mediante arrastrar y soltar o seleccion manual

### Comandos de Barra

- `/clear` — Reiniciar sesión
- `/compact` — Compactar conversación
- Carga dinamica de otros comandos disponibles

### Interrupción

- Detiene inmediatamente los mensajes y la ejecución de herramientas durante el streaming

### Túnel y Prevención de Suspensión

- **Soporte de acceso remoto desde el exterior**
  - Genera una URL accesible externamente y proporciona un código QR
  - Usa [cloudflared](https://github.com/cloudflare/cloudflared) de Cloudflare para hacer túnel del servidor local (gratuito, sin límites)
  - No hay comunicación con terceros más allá del servidor proxy de Cloudflare que proporciona el reenvío de puertos
  - Esta es una implementación propia de la comunidad, no relacionada con la función nativa oficial Remote Control de Claude (soporte previsto en el futuro)

- **Prevención de suspensión**
  - Prevención de suspensión en macOS (caffeinate), Linux (systemd-inhibit) y Windows (powercfg)

### Sincronización Bidireccional de Configuración

- Controla directamente desde el menú de configuración no solo los ajustes del plugin, sino también la configuración original de Claude Code (global y local)
- Se prevé una mejora futura para controlar mediante GUI toda la especificación oficial del archivo de configuración
- Soporte previsto para gestionar desde la GUI las áreas que administra `.claude`, como servidores MCP, habilidades y agentes

### Ejecución Independiente desde Navegador o Móvil

- Se puede usar de forma independiente desde un navegador o móvil sin necesidad del IDE de JetBrains
- El backend de Node.js proporciona un servidor WebSocket y el navegador se conecta como cliente
- No es exclusivo para desarrollo, es un objetivo de despliegue independiente — ofrece las mismas funciones que el entorno IDE desde el navegador

### Características Adicionales

- **Open Claude in Terminal** — Ejecuta Claude en el terminal del IDE desde la paleta de comandos
- **Enrutamiento de URL de sesión** — Las sesiones se restauran automáticamente aunque se reinicie el IDE
- **Múltiples proyectos en un solo proceso** — Un único proceso backend soporta múltiples proyectos simultáneamente
- **Configuración** — Configura la ruta del CLI, tema, tamaño de fuente, política de permisos y nivel de registro

<details>
<summary>Más capturas de pantalla</summary>

**Pantalla de bienvenida**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**Panel de configuración**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## Requisitos

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0 (instalado y autenticado)
- Node.js >= 18

## Inicio Rápido

1. Verifica que el CLI `claude` esté instalado y autenticado (`claude --version`).
2. Instala el plugin desde JetBrains Marketplace.
3. Abre el panel mediante **Tools > Open Claude Code** o presiona `Ctrl+Shift+C`.
4. Comienza a programar con Claude.

**Atajos de teclado**

- `Ctrl+Shift+C` — Abrir el panel de Claude Code
- `Cmd+N` / `Ctrl+N` (con el panel enfocado) — Nueva pestaña de sesión

## Solución de problemas

Los problemas frecuentes que todavía no hemos podido corregir por nuestra parte, pero para los que existe una solución conocida, están recogidos en **[docs/troubleshooting](troubleshooting/es/README.md)**, cada uno con los síntomas, la causa, cómo solucionarlo y enlaces a los issues relacionados.

- [Portapapeles en Wayland](troubleshooting/es/wayland-clipboard.md) — cuando pegar en el campo de chat falla en Linux · Wayland · KDE Plasma
- [JCEF en Android Studio](troubleshooting/es/android-studio-jcef.md) — cuando Android Studio muestra un panel informativo o una excepción en lugar del chat, o una ventana en blanco

Si tu problema no está en la lista, por favor [abre un issue](https://github.com/Swttch/swttch/issues/new/choose).

## Contribuciones

Se acepta todo tipo de contribución — reportes de errores, sugerencias de funciones, código, documentación, traducciones, etc.

- **Para empezar:** Consulta las instrucciones de configuración y las pautas en [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Si buscas algo en qué trabajar:** Revisa los issues con la etiqueta [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue).
- **Si planeas un cambio grande:** Por favor, [abre un issue](https://github.com/Swttch/swttch/issues) primero para discutirlo.

## Licencia

Este proyecto esta bajo licencia de la [GNU Affero General Public License v3.0](../LICENSE).
