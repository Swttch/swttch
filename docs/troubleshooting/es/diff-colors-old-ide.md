# La pantalla de revisión no tiene color

🌐 [English](../en/diff-colors-old-ide.md) | [한국어](../ko/diff-colors-old-ide.md) | [日本語](../ja/diff-colors-old-ide.md) | [中文](../zh/diff-colors-old-ide.md) | **Español** | [Deutsch](../de/diff-colors-old-ide.md) | [Français](../fr/diff-colors-old-ide.md)

_Última actualización: 2026-08-24_

Cuando Claude propone una edición te mostramos el cambio, pero **en IDE 2025.2 y anteriores esa pantalla sale sin color.** Todavía no hemos podido añadir una solución alternativa, y actualizar el IDE lo resuelve de inmediato.

## Síntomas

Toda la revisión se dibuja en un solo color.

![Una revisión sin color — el código es todo blanco y las líneas modificadas no tienen fondo](../../img/screenshot-diff-colors-missing.png)

- Palabras clave, cadenas y números no se distinguen: todo es blanco (o negro)
- **Las líneas añadidas y eliminadas no tienen color de fondo.** Ningún color indica qué líneas cambiaron
- Los números de línea y los separadores tienen ese mismo tono plano

Así debería verse.

![Una revisión normal — hay resaltado de sintaxis y las líneas añadidas tienen fondo verde](../../img/screenshot-diff-colors-ok.png)

El texto y los números de línea son correctos, y aprobar o rechazar funciona como siempre. **Cuesta más leerlo, pero no está roto.**

## Causa

Esta pantalla se dibuja sobre **JCEF**, el motor de navegador basado en Chromium que viene dentro del IDE. Elige sus colores con una función CSS llamada `light-dark()`: una sola línea contiene el color del tema claro y el del oscuro, y el navegador escoge el que corresponde.

Esa función necesita **Chromium 123 o posterior**. Esto es lo que trae el IDE:

| Versión del IDE | Chromium | Color |
|---|---|---|
| 2024.2 – 2025.2 | **122** | ausente |
| **2025.3 y posteriores** | **137** | correcto |

Una sola versión lo decide. En la 122 las declaraciones de color se descartan por completo y no queda nada que aplicar.

Chromium 122 es una compilación de marzo de 2024. Si llevas tiempo con el mismo IDE, el motor de navegador que hay dentro es igual de antiguo.

## Qué hacer

**Actualiza el IDE a 2025.3 o posterior.** Si puedes, mejor la última versión.

- **Help → Check for Updates**
- Si usas Toolbox, actualiza desde ahí

Reinicia el IDE y el color vuelve. No hace falta cambiar ningún ajuste del plugin.

Puedes ver tu versión en **Help → About**.

### Si no puedes actualizar

También puedes revisar el cambio en el **visor de diferencias del propio IDE**. Ese lo dibuja el IDE, así que no le afecta este problema.

Ve a **Ajustes → Vista de diferencias → Revisar los cambios en** y elige **Visor de diferencias del IDE**.

Ten en cuenta que allí no están disponibles ni las decisiones por bloque ni la edición directa de la propuesta: esas las ofrecemos solo en nuestra pantalla.

## Enlaces relacionados

### PR de este repositorio

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### Referencias externas

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — compatibilidad entre navegadores
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — el runtime que acompaña al IDE; JCEF vive dentro
