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
- Un wrapper que ejecuta el Claude Code CLI — el mismo enfoque que la extension oficial de VS Code
- **Todo el codigo fuente fue disenado y escrito desde cero** — no es un clon de ningun otro proyecto
- Arquitectura de entorno dual que permite **ejecucion independiente desde el navegador o movil**, ademas de los IDEs de JetBrains
- Ofrece como GUI la experiencia Claude Code en rapida evolucion (Agent Team, Remote Control, etc.)

> Actualmente dedicamos un gran esfuerzo a estabilizar el servicio. Si reportas un error, normalmente lo resolvemos en un promedio de 1 dia. Agradecemos mucho tu retroalimentacion.
>
> Este proyecto aspira a crecer junto con una comunidad global de desarrolladores. Adoptamos el **ingles como idioma comun oficial** para maximizar las oportunidades de colaboracion con la mayor cantidad posible de desarrolladores.

## Caracteristicas

### Chat en Streaming

- Renderizado de Markdown en tiempo real con resaltado de sintaxis (soporte de renderizado de formulas matematicas)
- Muestra el proceso de pensamiento (thinking) de Claude en tiempo real

### Tarjetas de Llamadas de Herramientas

- Muestra lecturas/escrituras de archivos, comandos Bash y resultados de busqueda como tarjetas visuales
- Interfaz consistente con Cursor y VS Code

### Gestion de Permisos

- Dialogos nativos para permisos de operaciones de archivos y Bash
- Configuracion flexible de politicas de permisos en los ajustes

### Multiples Sesiones

- Administra multiples conversaciones simultaneamente con soporte de pestanas
- Cambia rapidamente entre sesiones con el menu desplegable de sesiones
- Consulta el historial completo de sesiones

### Adjuntar Archivos e Imagenes

- Adjunta archivos e imagenes al chat mediante arrastrar y soltar o seleccion manual

### Comandos de Barra

- `/clear` — Reiniciar sesion
- `/compact` — Compactar conversacion
- Carga dinamica de otros comandos disponibles

### Interrupcion

- Detiene inmediatamente los mensajes y la ejecucion de herramientas durante el streaming

### Tunel y Prevencion de Suspension

- **Soporte de acceso remoto desde el exterior**
  - Genera una URL accesible externamente y proporciona un codigo QR
  - Usa [cloudflared](https://github.com/cloudflare/cloudflared) de Cloudflare para hacer tunel del servidor local (gratuito, sin limites)
  - No hay comunicacion con terceros mas alla del servidor proxy de Cloudflare que proporciona el reenvio de puertos
  - Esta es una implementacion propia de la comunidad, no relacionada con la funcion nativa oficial Remote Control de Claude (soporte previsto en el futuro)

- **Prevencion de suspension**
  - Prevencion de suspension en macOS (caffeinate), Linux (systemd-inhibit) y Windows (powercfg)

### Sincronizacion Bidireccional de Configuracion

- Controla directamente desde el menu de configuracion no solo los ajustes del plugin, sino tambien la configuracion original de Claude Code (global y local)
- Se prevee mejora futura para controlar mediante GUI toda la especificacion oficial del archivo de configuracion
- Soporte previsto para gestionar desde la GUI las areas que administra `.claude`, como servidores MCP, habilidades y agentes

### Ejecucion Independiente desde Navegador o Movil

- Se puede usar de forma independiente desde un navegador o movil sin necesidad del IDE de JetBrains
- El backend de Node.js proporciona un servidor WebSocket y el navegador se conecta como cliente
- No es exclusivo para desarrollo, es un objetivo de despliegue independiente — ofrece las mismas funciones que el entorno IDE desde el navegador

### Caracteristicas Adicionales

- **Open Claude in Terminal** — Ejecuta Claude en el terminal del IDE desde la paleta de comandos
- **Enrutamiento de URL de sesion** — Las sesiones se restauran automaticamente aunque se reinicie el IDE
- **Multiples proyectos en un solo proceso** — Un unico proceso backend soporta multiples proyectos simultaneamente
- **Configuracion** — Configura la ruta del CLI, tema, tamano de fuente, politica de permisos y nivel de registro

<details>
<summary>Mas capturas de pantalla</summary>

**Pantalla de bienvenida**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**Panel de configuracion**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## Requisitos

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0 (instalado y autenticado)
- Node.js >= 18

## Inicio Rapido

1. Verifica que el CLI `claude` este instalado y autenticado (`claude --version`).
2. Instala el plugin desde JetBrains Marketplace.
3. Abre el panel mediante **Tools > Open Claude Code** o presiona `Ctrl+Shift+C`.
4. Comienza a programar con Claude.

**Atajos de teclado**

- `Ctrl+Shift+C` — Abrir el panel de Claude Code
- `Cmd+N` / `Ctrl+N` (con el panel enfocado) — Nueva pestana de sesion

## Contribuciones

Se acepta todo tipo de contribucion — reportes de errores, sugerencias de funciones, codigo, documentacion, traducciones, etc.

- **Para empezar:** Consulta las instrucciones de configuracion y las pautas en [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Si buscas algo en que trabajar:** Revisa los issues con la etiqueta [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue).
- **Si planeas un cambio grande:** Por favor [abre un issue](https://github.com/Swttch/swttch/issues) primero para discutirlo.

## Licencia

Este proyecto esta bajo licencia de la [GNU Affero General Public License v3.0](../LICENSE).
