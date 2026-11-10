# Con CCG_HOME definida, tras actualizar parece que las cuentas guardadas, la licencia y otros datos se han reiniciado

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | **Español** | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_Última actualización: 2026-11-10_

**Esto solo afecta a quien haya definido por su cuenta la variable de entorno `CCG_HOME`.** Si nunca lo hizo, no cambia nada para usted y puede dejar de leer.

Hasta la versión v0.36.1, varios tipos de datos ignoraban `CCG_HOME` y se quedaban en la carpeta predeterminada `~/.claude-code-gui`, aunque `CCG_HOME` apuntara a otro lugar. Desde la versión posterior a v0.36.1 siguen `CCG_HOME`, igual que ya lo hacían sus prompts, proyectos y archivos subidos. Por eso el plugin abre la carpeta a la que apunta `CCG_HOME`, no encuentra sus archivos anteriores y empieza desde cero. **No se ha borrado nada.** Los archivos antiguos siguen en la carpeta predeterminada, y copiarlos como se indica abajo lo soluciona.

## Síntomas

- `swttch account` (o `ccg account`) dice que no hay cuentas guardadas, aunque guardó alguna antes
- Las funciones para patrocinadores están desactivadas, como si no tuviera clave de licencia
- La pregunta sobre enviar datos de uso anónimos vuelve a aparecer, como si nunca la hubiera respondido
- Los mensajes que había programado ya no están en la lista

## Cómo saber si le afecta

Ejecute esto en el terminal desde el que inicia el IDE o el plugin:

| Sistema | Comando | No le afecta si la salida es |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | vacía, o la misma carpeta que `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | vacía, o la misma carpeta que `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | vacía (si la variable no está definida, cmd imprime el texto `%CCG_HOME%` tal cual), o la misma carpeta que `%USERPROFILE%\.claude-code-gui` |

Si la salida es otra carpeta, le afecta.

## Qué ha cambiado de lugar

| Archivo o carpeta (en la antigua carpeta predeterminada) | Qué contiene | Qué hacer |
|---|---|---|
| `accounts.json` y la carpeta `accounts` | Las cuentas de Claude guardadas para cambiar rápido, **con sus datos de inicio de sesión** | Copiar |
| `license.json` | Su clave de licencia de patrocinador | Copiar |
| `profile.json` | Su respuesta sobre los datos de uso anónimos y el identificador aleatorio de esta instalación | Copiar |
| `scheduled-messages.json` | Los mensajes que programó | Copiar |
| Carpeta `workflow-agents` | Los nombres de agentes que muestra un workflow terminado al reabrir un chat | Copiar si quiere conservarlos |
| Carpetas `account-pool-recovery` y `cli-registry`, `logs/lifecycle.log`, carpeta `bin` | Notas de corta vida, la lista de procesos de Claude en ejecución, un registro de arranque, la herramienta de túnel descargada | Nada, se vuelven a crear o a descargar solas |

## Qué no ha cambiado de lugar

- **`settings.js`** (los ajustes del plugin) se queda a propósito en la carpeta predeterminada. El plugin del IDE lee y escribe el mismo archivo y no conoce `CCG_HOME`, así que ambos lados deben seguir usándolo. Sus ajustes no se reinician con este cambio
- **`auth-secret`**, el secreto que protege la conexión entre la página del chat y su backend, también se queda, por la misma razón: el comando `swttch` y el plugin del IDE lo comparten
- Sus prompts, proyectos, archivos subidos, archivos enviados y cifras de uso ya seguían `CCG_HOME` y no se ven afectados

## Cómo solucionarlo

Hágalo **antes** de guardar una cuenta, introducir una licencia o cambiar cualquier otra cosa en la versión actualizada. Copiar sobrescribe lo que haya en la carpeta nueva (vea "Conviene saber").

### 1. Detenga el plugin

Cierre la pestaña del plugin en el IDE, o cierre el IDE. Si usa la versión de navegador, ejecute `swttch stop`.

### 2. Copie los archivos a la carpeta que indica `CCG_HOME`

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
for f in accounts.json accounts license.json profile.json scheduled-messages.json workflow-agents; do
  [ -e ~/.claude-code-gui/$f ] && cp -pR ~/.claude-code-gui/$f "$CCG_HOME/"
done
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
foreach ($f in 'accounts.json','accounts','license.json','profile.json','scheduled-messages.json','workflow-agents') {
  $src = Join-Path $env:USERPROFILE ".claude-code-gui\$f"
  if (Test-Path $src) { Copy-Item $src $env:CCG_HOME -Recurse -Force }
}
```

Un archivo que nunca tuvo (por ejemplo, si nunca programó un mensaje) simplemente se omite.

### 3. Inicie el plugin de nuevo

Vuelven sus cuentas guardadas, la licencia, la respuesta sobre los datos de uso y los mensajes programados. `swttch account` muestra las cuentas.

### 4. Borre las copias antiguas (opcional)

Cuando compruebe que todo ha vuelto, puede borrar de `~/.claude-code-gui` los archivos que copió. Conserve `settings.js` y `auth-secret`, que se siguen usando allí. `accounts.json`, la carpeta `accounts` y `license.json` contienen datos de inicio de sesión y su clave de licencia, así que el único motivo para borrarlos es no dejar copias de más. Ya nada necesita las copias antiguas.

## Conviene saber

- **Copiar sobrescribe.** Si después de actualizar ya guardó una cuenta, introdujo una licencia o respondió la pregunta sobre datos de uso, eso está en la carpeta nueva y la copia lo sustituye por la versión antigua. En ese caso copie solo el elemento que le falta. Si solo perdió una cuenta, también puede iniciar sesión otra vez con `claude` y ejecutar `swttch account save`. Una clave de licencia perdida se puede introducir de nuevo
- No hace falta cambiar el valor de `CCG_HOME`. Solo cambió el lugar desde el que se leen los datos
- Con los comandos de arriba (`cp -p`) los archivos conservan el permiso exclusivo del propietario. No amplíe el permiso de `accounts.json`, de la carpeta `accounts` ni de `license.json`

## Enlaces relacionados

### Documentos de este repositorio

- [Biblioteca de prompts, dónde se guardan los prompts](../../features/064-prompt_library/en.md) — describe cómo `CCG_HOME` mueve toda la carpeta de datos (en inglés)
- [Adjuntar cualquier tipo de archivo, dónde se guardan las copias](../../features/085-attach_any_file_type/en.md) — las copias subidas también siguen `CCG_HOME` (en inglés)
