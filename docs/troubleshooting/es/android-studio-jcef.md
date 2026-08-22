# La ventana de chat no aparece en Android Studio (JCEF)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | **Español** | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_Última actualización: 2026-08-22_

Este plugin dibuja su interfaz de chat sobre **JCEF** (Chromium Embedded Framework). A diferencia de otros IDE de JetBrains, Android Studio no incluye JCEF de forma predeterminada, por lo que puede aparecer un panel informativo en lugar del chat.

**La solución cambia por completo según la versión de Android Studio.** Compruebe primero la suya (**Help → About**).

| Su versión | Vaya a |
|---|---|
| **2026.2 o posterior** (Rabbit) | [2026.2 y posteriores: instale el plugin](#20262-y-posteriores-instale-el-plugin) |
| **2026.1.3 – 2026.1.x** | [2026.1: cambie el runtime](#20261-cambie-el-runtime) |
| **2026.1.2 o anterior** | [2026.1.2 y anteriores: no hay combinación que funcione](#202612-y-anteriores-no-hay-combinación-que-funcione) |

---

## 2026.2 y posteriores: instale el plugin

### Síntomas

Al abrir el chat aparece un panel informativo o, en versiones antiguas del plugin, se lanza una excepción. En `idea.log` encontrará:

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

Más arriba en el registro también aparece:

```
plugin com.intellij.modules.jcef is not resolved
```

### Causa

**Desde 2026.2, JCEF salió del núcleo del IDE y pasó a ser un plugin aparte.** No se eliminó: cambió de sitio.

JetBrains incluye ese plugin en sus propios IDE, pero **Android Studio no lo incluye**. Por eso las clases `com.intellij.ui.jcef` no existen en ninguna parte del IDE.

Lo importante: **cambiar el runtime no sirve de nada.** El JetBrains Runtime aporta únicamente `org.cef.*`; `com.intellij.ui.jcef` es código de la plataforma y debe venir del IDE. Arrancar con un runtime con JCEF da el mismo resultado.

### Cómo solucionarlo

1. Abra **Settings → Plugins → Marketplace**
2. Busque **Web Browser (JCEF)** — el de **JetBrains**
3. Instálelo y reinicie el IDE

Tras reiniciar, el chat aparece con normalidad. Puede dejar el runtime tal como estaba.

> Página del Marketplace: [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### Combinaciones verificadas

| Android Studio | Estado inicial | Con Web Browser (JCEF) |
|---|---|---|
| **2026.2.1 Canary 2** (AI-262.9437) | Panel informativo (las versiones antiguas del plugin fallan) | **Funciona con normalidad** — sin cambiar el runtime |

---

## 2026.1: cambie el runtime

### Síntomas

Aparece un panel informativo en lugar de la interfaz de chat.

### Causa

El JetBrains Runtime (JBR) que acompaña a Android Studio no incluye JCEF. En 2026.1, JCEF todavía forma parte del núcleo del IDE, así que **cambiar a un runtime con JCEF lo resuelve.**

### Cómo solucionarlo

1. Asegúrese de que Android Studio sea **2026.1.3 o posterior** (para 2026.1.2 y anteriores, vea la sección siguiente)
2. Abra Find Action: `Cmd+Shift+A` (macOS) o `Ctrl+Shift+A` (Windows/Linux)
3. Ejecute **Choose Boot Java Runtime for the IDE…**
4. Elija un runtime cuyo nombre contenga **JCEF**
5. Reinicie el IDE cuando termine la instalación

El botón del panel informativo del plugin abre ese mismo diálogo.

---

## 2026.1.2 y anteriores: no hay combinación que funcione

### Síntomas

Después de cambiar el runtime ocurre una de estas dos cosas.

- Android Studio no arranca en absoluto
- Arranca, pero la ventana del plugin queda completamente en blanco: ni panel informativo ni mensaje de error

Cuando la ventana está en blanco, `idea.log` contiene:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### Causa

- Esas versiones se ejecutan sobre Java 21 e incluyen su propia copia de `JCefAppConfig`
- Si elige un **JBR 21** con JCEF, el módulo del runtime tapa esa copia. El `JCefAppConfig` de JBR 21 no tiene el método `isRemoteEnabled()` que la plataforma invoca, así que el navegador nunca se crea y la ventana se queda en blanco
- **JBR 25** sí tiene ese método, pero 2026.1.2 y anteriores no arrancan sobre Java 25. El Security Manager se eliminó en Java 24 y esas versiones todavía intentan activarlo

Android Studio **2026.1.3** pasó su runtime incluido de Java 21 a Java 25, lo que resuelve el problema.

### Cómo solucionarlo

Actualice Android Studio a **2026.1.3 o posterior**.

### Combinaciones verificadas

| Android Studio | JBR incluido | JBR 21 con JCEF | JBR 25 con JCEF |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — solo panel informativo | Ventana en blanco | No arranca |
| 2026.1.2 | Java 21 — solo panel informativo | Ventana en blanco | No arranca |
| **2026.1.3** | **Java 25** | — | **Funciona con normalidad** |

---

## Si el IDE no arranca tras cambiar el runtime

Elimine el archivo `studio.jdk` de la carpeta de configuración de Android Studio para volver al runtime predeterminado.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<versión>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<versión>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<versión>\studio.jdk`

## Enlaces relacionados

### Issues de este repositorio

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests de este repositorio

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Referencias externas

- [Plugin Web Browser (JCEF) en el Marketplace](https://plugins.jetbrains.com/plugin/31360) — el plugin de JetBrains que añade JCEF a Android Studio
- [Anuncio de JetBrains: Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
