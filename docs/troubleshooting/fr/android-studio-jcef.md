# La fenêtre de chat n'apparaît pas dans Android Studio (runtime JCEF)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | **Français**

_Dernière mise à jour : 2026-08-22_

## Symptômes

À l'ouverture du plugin dans Android Studio, un panneau d'information s'affiche à la place de l'interface de chat.

Après avoir changé de runtime, l'une de ces deux choses peut se produire.

- Android Studio ne démarre plus du tout
- Il démarre, mais la fenêtre du plugin est entièrement vide : ni panneau d'information, ni message d'erreur

Lorsque la fenêtre est vide, `idea.log` contient :

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## Cause

Le JetBrains Runtime (JBR) livré avec Android Studio **ne contient pas JCEF** (Chromium Embedded Framework).

L'interface de ce plugin est dessinée sur JCEF, c'est pourquoi le runtime par défaut affiche un panneau d'information au lieu de l'écran de chat.

Jusque-là, passer à un runtime doté de JCEF résout le problème.

Cependant, **sur Android Studio 2026.1.2 et antérieur, aucune combinaison ne fonctionne.**

- Ces versions tournent sur Java 21 et embarquent leur propre `JCefAppConfig`
- Si vous choisissez une **JBR 21** avec JCEF, le module du runtime masque cette copie embarquée. La `JCefAppConfig` de JBR 21 ne possède pas la méthode `isRemoteEnabled()` que la plateforme appelle. Le navigateur n'est jamais créé et la fenêtre reste vide
- **JBR 25** possède bien cette méthode, mais 2026.1.2 et antérieur ne peuvent pas démarrer sur Java 25. Le Security Manager a été supprimé dans Java 24, et ces builds tentent toujours de l'activer

Android Studio **2026.1.3** a fait passer son runtime embarqué de Java 21 à Java 25, ce qui résout le problème.

## Combinaisons vérifiées

| Android Studio | JBR embarquée | JBR 21 avec JCEF | JBR 25 avec JCEF |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — panneau d'information seulement | Fenêtre vide | Ne démarre pas |
| 2026.1.2 | Java 21 — panneau d'information seulement | Fenêtre vide | Ne démarre pas |
| **2026.1.3** | **Java 25** | — | **Fonctionne normalement** |

## Comment le corriger

1. Mettez Android Studio à jour vers **2026.1.3 ou une version ultérieure**
2. Ouvrez Find Action : `Cmd+Shift+A` (macOS) ou `Ctrl+Shift+A` (Windows/Linux)
3. Lancez **Choose Boot Java Runtime for the IDE…**
4. Choisissez un runtime dont le nom contient **JCEF**
5. Redémarrez l'IDE une fois l'installation terminée

Le bouton **Switch Runtime** du panneau d'information du plugin ouvre la même boîte de dialogue.

## Si l'IDE ne démarre plus après le changement de runtime

Supprimez le fichier `studio.jdk` du répertoire de configuration d'Android Studio pour rétablir le runtime par défaut.

- **macOS** : `~/Library/Application Support/Google/AndroidStudio<version>/studio.jdk`
- **Linux** : `~/.config/Google/AndroidStudio<version>/studio.jdk`
- **Windows** : `%APPDATA%\Google\AndroidStudio<version>\studio.jdk`

## Quand cela disparaîtra-t-il

JetBrains a publié en avril 2025 un plugin expérimental nommé [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360).

Il apporte JCEF à Android Studio 2026.1 Nightly et aux versions ultérieures.

Une fois qu'il sera stable, le changement de runtime décrit ci-dessus ne sera plus nécessaire.

## Liens associés

### Issues de ce dépôt

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests de ce dépôt

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Références externes

- [Plugin Web Browser (JCEF) sur le Marketplace](https://plugins.jetbrains.com/plugin/31360) — le plugin expérimental de JetBrains qui ajoute JCEF à Android Studio
