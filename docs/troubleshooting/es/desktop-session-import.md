# Las sesiones creadas en el plugin no aparecen en la pestaña Code de Claude Desktop

🌐 [English](../en/desktop-session-import.md) | [한국어](../ko/desktop-session-import.md) | [日本語](../ja/desktop-session-import.md) | [中文](../zh/desktop-session-import.md) | **Español** | [Deutsch](../de/desktop-session-import.md) | [Français](../fr/desktop-session-import.md)

_Última actualización: 2026-11-09_

Una sesión creada en el plugin no aparece por sí sola en la pestaña Code de Claude Desktop. En el sentido contrario, abrir en el plugin una sesión creada en Desktop, funciona desde el principio. El archivo con el que Desktop arma su lista no está documentado y no podemos escribir en él por usted. Lo que sí puede hacer es **ejecutar una vez la función de importar sesiones que trae el propio Desktop**. Desde la v0.36.0, las sesiones nuevas se inician de modo que esa importación las reconozca, y las que creó antes se pueden preparar con un botón en Configuración.

## Síntomas

- Una sesión que usaba en el plugin no está en la lista de la izquierda de la pestaña Code de Claude Desktop
- En la misma carpeta, `claude --resume` en un terminal sí abre esa sesión. La conversación sigue ahí
- Las sesiones iniciadas en Desktop sí aparecen en la lista de sesiones del plugin

## Causa

Desktop no muestra los archivos de conversación tal cual: arma su lista a partir de un índice propio, y una sesión que no está en el índice no aparece, aunque su archivo exista.

Lo que añade sesiones a ese índice es la función **Importar sesiones de la CLI de Claude Code** de Desktop. Pero esa importación omite toda sesión cuyo registro dice `sdk-cli`. El plugin inicia Claude de la misma forma no interactiva que las herramientas SDK, así que antes el registro de cada sesión decía `sdk-cli`.

Desde la v0.36.0 el plugin inicia las sesiones nuevas con un nombre propio: `swttch-jetbrains` dentro de un IDE y `swttch-standalone` en el navegador (`ccg`). La importación de Desktop acepta esos nombres.

## Cómo solucionarlo

### 1. Si tiene sesiones anteriores a la v0.36.0: prepárelas en el plugin

**Configuración → General → Preparar las sesiones para importarlas en Claude Desktop → Preparar**

- Prepara solo las sesiones de la carpeta abierta. Para otra carpeta, ábrala y pulse el botón de nuevo
- "Sesiones preparadas: N" significa que terminó
- Una sesión que se está ejecutando en ese momento no se toca. Si ve "Sesiones que se dejaron como estaban porque están en uso", cierre esas sesiones y pulse el botón de nuevo
- Si todas sus sesiones se crearon después de la v0.36.0, omita este paso

### 2. Impórtelas en Claude Desktop

En el menú, elija **Ayuda → Solución de problemas → Importar sesiones de la CLI de Claude Code…**.

Aparece un cuadro que pregunta "¿Importar N sesiones de Claude Code?". Pulse **Importar sesiones**. Cuando indique que se importaron, búsquelas en la lista de la pestaña Code.

- La importación trae **de una vez** todas las sesiones que aún no están en la lista. No hay que pulsarla por cada sesión. Púlsela de vez en cuando, tras crear varias sesiones en el plugin
- **Cancelar** en el cuadro no importa nada
- Esa ubicación del menú se comprobó en la aplicación de escritorio para macOS. En Windows y Linux puede ser distinta

### 3. Seguir trabajando

Un mensaje que envíe en una sesión importada se añade al mismo registro de conversación. Si vuelve a abrir esa sesión en el plugin, también verá la conversación que tuvo en Desktop.

No ejecute una misma sesión en los dos sitios **a la vez**. Dos programas escribirían en el mismo archivo de registro. Termine en uno y continúe después en el otro.

## Conviene saber

- Solo se importan las sesiones de **carpetas de confianza**. "No hay sesiones de la CLI para importar" significa que las sesiones importables ya están en su lista, se eliminaron antes o están en carpetas que Claude aún no considera de confianza. Si una sesión del plugin no aparece, compruebe primero que hizo el paso 1
- Una sesión que **eliminó** en Desktop no se vuelve a importar
- Una sesión importada conserva su historial y su modo de permisos (excepto el modo de omisión de permisos), pero no su estado de archivo ni los permisos concedidos
- El botón del paso 1 cambia el `sdk-cli` que figura en cada línea del archivo de registro por el nombre nuevo y **añade una línea con el título de la sesión** (el nombre que el plugin muestra para ella) a toda sesión que no tenga un nombre elegido con `/rename`. Sin esa línea, Desktop nombra la sesión importada con su primer mensaje y muestra como título la frase del contexto del IDE (por ejemplo "The user opened the file .env in the IDE"). Todo lo demás queda como estaba. Una sesión creada por otra herramienta SDK en la misma carpeta se cambia con ella
- No escribimos en los archivos propios de Desktop para meter sesiones en su lista. Esos archivos no están documentados y una actualización de Desktop podría romperlo sin avisar

### Si sigue sin funcionar

En la misma carpeta puede continuar la sesión con `claude --resume` en un terminal.

## Enlaces relacionados

### Incidencia de este repositorio

- [#647 — Sessions created in the plugin don't appear in the Claude Desktop Code tab](https://github.com/Swttch/swttch/issues/647)

### Documento de este repositorio

- [Registro de excepción a un principio: `CLAUDE_CODE_ENTRYPOINT` para la importación de sesiones](../../principle-exceptions/647-entrypoint-for-desktop-import.md) — por qué se eligió este camino y qué se comprobó (en coreano)
