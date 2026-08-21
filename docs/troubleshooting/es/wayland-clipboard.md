# No se puede pegar cuando el IDE de JetBrains se ejecuta sobre Wayland

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | **Español** | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_Última actualización: 2026-08-22_

## Síntomas

Pegar en el campo de entrada del chat del plugin falla sin que ocurra nada.

Tampoco aparece ningún mensaje de error.

Hay un detalle revelador.

El texto copiado **dentro** del plugin se pega sin problemas, mientras que el copiado **fuera** de él — de un navegador, una terminal, el editor del IDE — falla.

En el editor de código del mismo IDE y en los campos de búsqueda, pegar funciona con normalidad.

Esto no se limita al texto. **Las imágenes, como las capturas de pantalla, fallan igual.**

## Entornos afectados

Ocurre en Linux, en una sesión de Wayland, sobre el escritorio KDE Plasma.

Hasta ahora se ha confirmado en Fedora 44, Ubuntu 26.04 y CachyOS.

Una persona cambió a GNOME y el problema desapareció.

## Causa

Al parecer, el portapapeles no está conectado entre el soporte de Wayland del JetBrains Runtime (Project Wakefield) y JCEF, de modo que el IDE y JCEF acaban mirando portapapeles distintos.

La interfaz del plugin se dibuja sobre JCEF, y por eso se ve afectada.

El mismo síntoma se ha reportado en otros plugins de JetBrains que usan JCEF.

Como el portapapeles se pierde antes de llegar al plugin, todavía no hemos encontrado la forma de corregirlo solo con el código del plugin.

## Cómo solucionarlo

Abre `Help → Edit Custom VM Options`, añade la línea siguiente y reinicia el IDE.

```
-Dawt.toolkit.name=XToolkit
```

Si ya tienes una línea que empieza por `-Dawt.toolkit.name=` (como `auto` o `WLToolkit`), sustitúyela por la de arriba.

Tres personas han confirmado que funciona, cada una en una distribución distinta.

## Qué tener en cuenta

Este ajuste devuelve el IDE a XWayland.

Por eso, **la pantalla puede verse borrosa si usas un escalado fraccionario como 125 % o 150 %.**

Es una solución temporal, no un arreglo real.

Si el desenfoque te molesta más que el problema de pegado, puedes revertir el ajuste.

## Cuándo dejará de ocurrir

Dejará de ser necesario cuando el soporte nativo de Wayland de JetBrains sea estable.

El ticket relacionado [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) sigue abierto.

Votarlo ayuda a subir su prioridad.

## Enlaces relacionados

### Issues de este repositorio

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### Tickets de JetBrains

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — el problema del portapapeles con JCEF. **Sigue abierto y se puede votar**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — cerrado como "Third-Party problem", tratado como un fallo de KDE
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — soporte del portapapeles en Wayland, marcado como corregido en 2024
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — no se puede copiar desde una vista previa de JCEF en Arch/Hyprland
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — el propio soporte nativo de Wayland sigue en desarrollo
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — el reporte original sobre el plugin Continue, cerrado como duplicado de JBR-5857

### El mismo síntoma en otros plugins

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — abierto
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — el mantenedor [comentó](https://github.com/cline/cline/issues/8383#issuecomment-4173099236) que no se puede arreglar desde el plugin
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — reportado en Fedora 43/44, Arch, Kubuntu 26.04 y más
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### Referencias externas

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — el fallo de KDE que JetBrains señaló al cerrar JBR-10222. Sin embargo, ya se corrigió en Plasma 6.2.0, y quienes lo reportan aquí usan versiones posteriores
