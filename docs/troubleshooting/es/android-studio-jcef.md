# La ventana de chat no aparece en Android Studio (runtime JCEF)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | **Español** | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_Última actualización: 2026-08-22_

## Síntomas

Al abrir el plugin en Android Studio aparece un panel informativo en lugar de la interfaz de chat.

Después de cambiar el runtime, puede ocurrir una de estas dos cosas.

- Android Studio no arranca en absoluto
- Arranca, pero la ventana del plugin está completamente en blanco: ni panel informativo ni mensaje de error

Cuando la ventana queda en blanco, `idea.log` contiene:

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## Causa

El JetBrains Runtime (JBR) que viene con Android Studio **no incluye JCEF** (Chromium Embedded Framework).

La interfaz de este plugin se dibuja sobre JCEF, así que con el runtime por defecto aparece un panel informativo en vez de la pantalla de chat.

Hasta aquí, cambiar a un runtime con JCEF lo resuelve.

Sin embargo, **en Android Studio 2026.1.2 y anteriores no existe ninguna combinación que funcione.**

- Esas versiones corren sobre Java 21 e incluyen su propia `JCefAppConfig`
- Si eliges una **JBR 21** con JCEF, el módulo del runtime tapa esa copia incluida. La `JCefAppConfig` de JBR 21 no tiene el método `isRemoteEnabled()` que la plataforma invoca. El navegador nunca se crea y la ventana se queda en blanco
- **JBR 25** sí tiene ese método, pero 2026.1.2 y anteriores no pueden arrancar sobre Java 25. El Security Manager se eliminó en Java 24 y esas compilaciones siguen intentando activarlo

Android Studio **2026.1.3** cambió su runtime incluido de Java 21 a Java 25, lo que resuelve el problema.

## Combinaciones verificadas

| Android Studio | JBR incluida | JBR 21 con JCEF | JBR 25 con JCEF |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — solo panel informativo | Ventana en blanco | No arranca |
| 2026.1.2 | Java 21 — solo panel informativo | Ventana en blanco | No arranca |
| **2026.1.3** | **Java 25** | — | **Funciona con normalidad** |

## Cómo solucionarlo

1. Actualiza Android Studio a **2026.1.3 o posterior**
2. Abre Find Action: `Cmd+Shift+A` (macOS) o `Ctrl+Shift+A` (Windows/Linux)
3. Ejecuta **Choose Boot Java Runtime for the IDE…**
4. Elige un runtime cuyo nombre contenga **JCEF**
5. Reinicia el IDE cuando termine la instalación

El botón **Switch Runtime** del panel informativo del plugin abre el mismo diálogo.

## Si el IDE no arranca tras cambiar el runtime

Elimina el archivo `studio.jdk` del directorio de configuración de Android Studio para restaurar el runtime por defecto.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<versión>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<versión>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<versión>\studio.jdk`

## Cuándo dejará de ocurrir

En abril de 2025 JetBrains publicó un plugin experimental llamado [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360).

Lleva JCEF a Android Studio 2026.1 Nightly y posteriores.

Cuando sea estable, el cambio de runtime descrito arriba dejará de ser necesario.

## Enlaces relacionados

### Issues de este repositorio

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests de este repositorio

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Referencias externas

- [Plugin Web Browser (JCEF) en el Marketplace](https://plugins.jetbrains.com/plugin/31360) — el plugin experimental de JetBrains que añade JCEF a Android Studio
