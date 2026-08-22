# La fenêtre de chat n'apparaît pas dans Android Studio (JCEF)

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | **Français**

_Dernière mise à jour : 2026-08-22_

Ce plugin dessine son interface de chat sur **JCEF** (Chromium Embedded Framework). Contrairement aux autres IDE JetBrains, Android Studio n'embarque pas JCEF par défaut : un panneau d'information peut donc s'afficher à la place du chat.

**La solution diffère complètement selon la version d'Android Studio.** Vérifiez d'abord la vôtre (**Help → About**).

| Votre version | Aller à |
|---|---|
| **2026.2 ou ultérieure** (Rabbit) | [2026.2 et ultérieures : installez le plugin](#20262-et-ultérieures--installez-le-plugin) |
| **2026.1.3 – 2026.1.x** | [2026.1 : changez de runtime](#20261--changez-de-runtime) |
| **2026.1.2 ou antérieure** | [2026.1.2 et antérieures : aucune combinaison ne fonctionne](#202612-et-antérieures--aucune-combinaison-ne-fonctionne) |

---

## 2026.2 et ultérieures : installez le plugin

### Symptômes

À l'ouverture du chat, un panneau d'information s'affiche ; avec les anciennes versions du plugin, une exception est levée. `idea.log` contient :

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

Plus haut dans le journal figure également :

```
plugin com.intellij.modules.jcef is not resolved
```

### Cause

**Depuis 2026.2, JCEF a quitté le cœur de l'IDE pour devenir un plugin distinct.** Il n'a pas été supprimé : il a changé d'adresse.

JetBrains fournit ce plugin avec ses propres IDE, mais **Android Studio ne l'embarque pas**. Les classes `com.intellij.ui.jcef` sont donc totalement absentes de l'IDE.

Le point important : **changer de runtime n'y change rien.** Le JetBrains Runtime ne fournit que `org.cef.*` ; `com.intellij.ui.jcef` relève du code de la plateforme et doit venir de l'IDE. Démarrer avec un runtime doté de JCEF donne le même résultat.

### Comment le résoudre

1. Ouvrez **Settings → Plugins → Marketplace**
2. Recherchez **Web Browser (JCEF)** — celui de **JetBrains**
3. Installez-le et redémarrez l'IDE

Après le redémarrage, le chat s'affiche normalement. Vous pouvez laisser le runtime par défaut.

> Page du Marketplace : [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### Combinaisons vérifiées

| Android Studio | État d'origine | Avec Web Browser (JCEF) |
|---|---|---|
| **2026.2.1 Canary 2** (AI-262.9437) | Panneau d'information (les anciennes versions du plugin échouent) | **Fonctionne normalement** — sans changer de runtime |

---

## 2026.1 : changez de runtime

### Symptômes

Un panneau d'information s'affiche à la place de l'interface de chat.

### Cause

Le JetBrains Runtime (JBR) livré avec Android Studio ne contient pas JCEF. Sur 2026.1, JCEF fait encore partie du cœur de l'IDE : **passer à un runtime doté de JCEF résout donc le problème.**

### Comment le résoudre

1. Assurez-vous qu'Android Studio est en **2026.1.3 ou ultérieure** (pour 2026.1.2 et antérieures, voir la section suivante)
2. Ouvrez Find Action : `Cmd+Shift+A` (macOS) ou `Ctrl+Shift+A` (Windows/Linux)
3. Exécutez **Choose Boot Java Runtime for the IDE…**
4. Choisissez un runtime dont le nom contient **JCEF**
5. Redémarrez l'IDE une fois l'installation terminée

Le bouton du panneau d'information du plugin ouvre la même boîte de dialogue.

---

## 2026.1.2 et antérieures : aucune combinaison ne fonctionne

### Symptômes

Après avoir changé de runtime, l'une de ces deux choses se produit.

- Android Studio ne démarre pas du tout
- Il démarre, mais la fenêtre du plugin reste entièrement vide — ni panneau d'information, ni message d'erreur

Quand la fenêtre est vide, `idea.log` contient :

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### Cause

- Ces versions tournent sur Java 21 et embarquent leur propre `JCefAppConfig`
- Si vous choisissez un **JBR 21** doté de JCEF, le module du runtime masque cette copie embarquée. Le `JCefAppConfig` de JBR 21 ne possède pas la méthode `isRemoteEnabled()` que la plateforme appelle : le navigateur n'est jamais créé et la fenêtre reste vide
- **JBR 25** possède bien cette méthode, mais 2026.1.2 et antérieures ne démarrent pas sur Java 25. Le Security Manager a été retiré dans Java 24, et ces versions tentent encore de l'activer

Android Studio **2026.1.3** a fait passer son runtime embarqué de Java 21 à Java 25, ce qui règle la question.

### Comment le résoudre

Mettez Android Studio à jour vers **2026.1.3 ou ultérieure**.

### Combinaisons vérifiées

| Android Studio | JBR embarqué | JBR 21 avec JCEF | JBR 25 avec JCEF |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — panneau d'information seul | Fenêtre vide | Ne démarre pas |
| 2026.1.2 | Java 21 — panneau d'information seul | Fenêtre vide | Ne démarre pas |
| **2026.1.3** | **Java 25** | — | **Fonctionne normalement** |

---

## Si l'IDE ne démarre plus après un changement de runtime

Supprimez le fichier `studio.jdk` du dossier de configuration d'Android Studio pour rétablir le runtime par défaut.

- **macOS** : `~/Library/Application Support/Google/AndroidStudio<version>/studio.jdk`
- **Linux** : `~/.config/Google/AndroidStudio<version>/studio.jdk`
- **Windows** : `%APPDATA%\Google\AndroidStudio<version>\studio.jdk`

## Liens connexes

### Issues de ce dépôt

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### Pull requests de ce dépôt

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### Références externes

- [Plugin Web Browser (JCEF) sur le Marketplace](https://plugins.jetbrains.com/plugin/31360) — le plugin JetBrains qui ajoute JCEF à Android Studio
- [Annonce JetBrains : Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
