# La pestaña de chat se abre completamente vacía en Linux

🌐 [English](../en/linux-jcef-blank-panel.md) | [한국어](../ko/linux-jcef-blank-panel.md) | [日本語](../ja/linux-jcef-blank-panel.md) | [中文](../zh/linux-jcef-blank-panel.md) | **Español** | [Deutsch](../de/linux-jcef-blank-panel.md) | [Français](../fr/linux-jcef-blank-panel.md)

_Última actualización: 2026-09-08_

## Síntomas

La pestaña de chat se abre, pero su interior queda completamente en blanco.

El texto `Waiting for project indexing...` aparece un momento, desaparece, y nada ocupa su lugar.

No se muestra ningún mensaje de error ni ningún panel informativo. La pestaña simplemente se queda vacía.

## Compruebe esto primero

Abra cualquier archivo `.md` en el mismo IDE y active su vista previa de Markdown.

**Si la vista previa de Markdown también está en blanco, este documento es el suyo.**

Esa vista previa la dibuja el propio IDE, no este complemento. Cuando ambas pantallas se quedan vacías a la vez, el problema está en el navegador integrado del IDE (JCEF) y no en un complemento concreto.

Esta única comprobación ahorra mucho tiempo, porque desde fuera una pestaña de chat vacía y un JCEF averiado se ven exactamente igual.

## Entornos afectados

Ocurre en Linux.

Se ha confirmado en Ubuntu 22.04 con PhpStorm 2026.2.2, en un equipo con tarjeta gráfica NVIDIA dentro de una sesión Wayland.

Quien lo reportó había cambiado varios valores del registro relacionados con JCEF respecto a sus valores por defecto, para sortear un problema distinto de Wayland.

Dos factores lo hacen más probable:

- una sesión **Wayland** en lugar de X11
- el controlador propietario de **NVIDIA**

## Causa

Este complemento dibuja su interfaz de chat sobre **JCEF** (Chromium Embedded Framework), el mismo componente que el IDE usa para su vista previa de Markdown y su navegador integrado.

JCEF renderiza a través de la GPU. Cuando esa ruta no funciona con una combinación concreta de controlador y sesión, el navegador se crea correctamente pero no se pinta ni un solo fotograma, así que el panel se queda vacío.

Todavía no detectamos este caso. Cuando JCEF no se puede usar, o cuando nuestro backend no arranca, sustituimos el marcador de posición por un panel que explica lo ocurrido. Un JCEF que arranca con normalidad y luego nunca pinta parece un éxito desde nuestro lado, y por eso usted acaba con una pestaña vacía y sin ningún mensaje.

## Cómo solucionarlo

Pruebe en este orden. El paso 1 es lo que resolvió el caso reportado.

### 1. Devuelva los valores del registro de JCEF a sus valores por defecto

Abra `Help → Find Action`, ejecute **Registry…** y busque `jcef`.

Revise estas cuatro entradas y restaure las que ya no estén en su valor por defecto.

| Entrada | Valor por defecto |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

Las entradas modificadas se muestran en negrita, y el diálogo del registro tiene un botón **Restore Defaults**.

Reinicie el IDE después.

Los valores que se activaron para sortear algún otro problema de Wayland son un motivo habitual de acabar aquí.

### 2. Cambie la sesión a X11

Cierre la sesión y elija una sesión **X11** (o «Xorg») en la pantalla de inicio de sesión, en lugar de Wayland.

Si prefiere mantener el escritorio en Wayland, puede mover solo el IDE a XWayland. Abra `Help → Edit Custom VM Options`, añada la línea siguiente y reinicie.

```
-Dawt.toolkit.name=XToolkit
```

Si ya existe una línea que empieza por `-Dawt.toolkit.name=`, sustitúyala.

### 3. Solo si los dos pasos anteriores no ayudaron, desactive la aceleración por GPU

Esto va en dirección contraria al paso 1, así que hágalo únicamente después de que el paso 1 haya fallado.

En **Registry…**, ponga `ide.browser.jcef.gpu.disable` en `true` y reinicie.

JetBrains sugirió exactamente esto a otro usuario cuyo navegador integrado aparecía vacío, y con ello la pantalla volvió a dibujarse ([IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)).

## Qué tener en cuenta

**Anote el valor original antes de cambiar cualquier entrada del registro.** Estos ajustes afectan a todas las pantallas del IDE que usan el navegador integrado, no solo a este complemento.

Pasar a X11 o XWayland devuelve el IDE a la ruta de visualización antigua. Por eso **la pantalla puede verse borrosa si usa un escalado fraccionado como 125 % o 150 %.** Es una solución temporal y puede revertirla.

Al desactivar la aceleración por GPU, JCEF renderiza por CPU, lo que puede resultar más lento en páginas pesadas.

## Si nada de esto funciona

En esta situación JetBrains pide un registro detallado de JCEF.

Añada la línea siguiente en `Help → Edit Custom VM Options`, reinicie, reproduzca la pestaña vacía y recoja el archivo `~/jcef_<PID>.log`.

```
-Dide.browser.jcef.log.level=verbose
```

Adjunte ese archivo cuando [abra una incidencia](https://github.com/Swttch/swttch/issues/new/choose), junto con su distribución, su tipo de sesión (Wayland o X11) y su controlador gráfico.

## Cuándo dejará de ocurrir

Dejará de ser necesario cuando JCEF renderice de forma fiable en estas combinaciones de controlador y sesión.

Los tickets de abajo siguen abiertos, y votarlos ayuda a elevar su prioridad.

También estamos estudiando si el complemento puede detectar un navegador que nunca pinta y decírselo en pantalla, en lugar de dejarle una pestaña vacía.

## Enlaces relacionados

### Incidencias de este repositorio

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### Tickets de JetBrains

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — un navegador integrado que aparece vacío en Linux, atribuido a un error de VA-API. **Sigue abierto y puede votarlo.** JetBrains sugirió aquí `ide.browser.jcef.gpu.disable` y quien lo reportó confirmó que funcionó
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — la aceleración por GPU rompiendo JCEF en Linux con el controlador de NVIDIA, y la petición de una forma fiable de desactivarla. **Sigue abierto**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — el soporte nativo de Wayland en sí, todavía en curso
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — el mismo síntoma de pantalla en blanco, cerrado como Incomplete por falta de información

### Documentos relacionados

- [Portapapeles en Wayland](wayland-clipboard.md) — el otro problema de Wayland, donde falla pegar en el campo de entrada del chat
