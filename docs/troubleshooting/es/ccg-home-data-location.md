# Con CCG_HOME definida, tras actualizar parece que los ajustes y las cuentas guardadas se han reiniciado

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | **Español** | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_Última actualización: 2026-11-10_

**Esto solo afecta a quien haya definido por su cuenta la variable de entorno `CCG_HOME`.** Si nunca lo hizo, no cambia nada para usted y puede dejar de leer.

Hasta la versión v0.36.1, tres tipos de datos ignoraban `CCG_HOME` y se quedaban en la carpeta predeterminada `~/.claude-code-gui`, aunque `CCG_HOME` apuntara a otro lugar. Desde la versión posterior a v0.36.1, esos tres tipos siguen `CCG_HOME`, igual que el resto de los datos del plugin. Por eso el plugin abre la carpeta a la que apunta `CCG_HOME`, no encuentra sus archivos anteriores y empieza con los valores predeterminados. **No se ha borrado nada.** Los archivos antiguos siguen en la carpeta predeterminada, y copiarlos como se indica abajo lo soluciona.

## Síntomas

- Tras actualizar, los ajustes han vuelto a los valores predeterminados (tema, tamaño de fuente, etc.)
- `swttch account` (o `ccg account`) dice que no hay cuentas guardadas, aunque guardó alguna antes
- Cualquier otro lugar que muestre las cuentas guardadas aparece vacío

## Cómo saber si le afecta

Ejecute esto en el terminal desde el que inicia el IDE o el plugin:

| Sistema | Comando | No le afecta si la salida es |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | vacía, o la misma carpeta que `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | vacía, o la misma carpeta que `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | vacía (si la variable no está definida, cmd imprime el texto `%CCG_HOME%` tal cual), o la misma carpeta que `%USERPROFILE%\.claude-code-gui` |

Si la salida es otra carpeta, le afecta.

## Qué ha cambiado de lugar

| Archivo o carpeta (en la antigua carpeta predeterminada) | Qué contiene |
|---|---|
| `settings.js` | Los ajustes del plugin |
| `accounts.json` y la carpeta `accounts` | Las cuentas de Claude guardadas para cambiar rápido, **con sus datos de inicio de sesión** |
| `cli-registry` | Una lista temporal de procesos de Claude en ejecución. **No hay que hacer nada**, se vuelve a crear sola |

## Cómo solucionarlo

Hágalo **antes** de cambiar un ajuste o guardar una cuenta en la versión actualizada. Copiar sobrescribe lo que haya en la carpeta nueva (vea "Conviene saber").

### 1. Detenga el plugin

Cierre la pestaña del plugin en el IDE, o cierre el IDE. Si usa la versión de navegador, ejecute `swttch stop`.

### 2. Copie los archivos a la carpeta que indica `CCG_HOME`

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
cp -p ~/.claude-code-gui/settings.js "$CCG_HOME/"
cp -pR ~/.claude-code-gui/accounts.json ~/.claude-code-gui/accounts "$CCG_HOME/"
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
Copy-Item "$env:USERPROFILE\.claude-code-gui\settings.js" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts.json" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts" $env:CCG_HOME -Recurse -ErrorAction SilentlyContinue
```

Un aviso de "no se encuentra" para un archivo que nunca tuvo (por ejemplo, si nunca guardó una cuenta) no es un problema.

### 3. Inicie el plugin de nuevo

Sus ajustes y sus cuentas guardadas vuelven. `swttch account` las muestra.

### 4. Borre las copias antiguas (opcional)

Cuando compruebe que todo ha vuelto, puede borrar `settings.js`, `accounts.json` y la carpeta `accounts` de `~/.claude-code-gui`. Los archivos de cuentas contienen datos de inicio de sesión, así que el único motivo para borrarlos es no dejar copias de más. Ya nada necesita las copias antiguas.

## Conviene saber

- **Copiar sobrescribe.** Si después de actualizar ya cambió un ajuste o guardó una cuenta, eso está en la carpeta nueva y la copia lo sustituye por la versión antigua. En ese caso copie solo el archivo que le falta. Si solo perdió una cuenta, también puede iniciar sesión otra vez con `claude` y ejecutar `swttch account save`
- No hace falta cambiar el valor de `CCG_HOME`. Solo cambió el lugar desde el que se leen los datos
- Con los comandos de arriba (`cp -p`) los archivos conservan el permiso exclusivo del propietario. No amplíe el permiso de `accounts.json` ni de la carpeta `accounts`
- Sus prompts, proyectos y archivos subidos nunca se vieron afectados. Ya seguían `CCG_HOME`

## Enlaces relacionados

### Documentos de este repositorio

- [Biblioteca de prompts, dónde se guardan los prompts](../../features/064-prompt_library/en.md) — describe cómo `CCG_HOME` mueve toda la carpeta de datos (en inglés)
- [Adjuntar cualquier tipo de archivo, dónde se guardan las copias](../../features/085-attach_any_file_type/en.md) — las copias subidas también siguen `CCG_HOME` (en inglés)
