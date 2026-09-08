# L'onglet de discussion s'ouvre entièrement vide sous Linux

🌐 [English](../en/linux-jcef-blank-panel.md) | [한국어](../ko/linux-jcef-blank-panel.md) | [日本語](../ja/linux-jcef-blank-panel.md) | [中文](../zh/linux-jcef-blank-panel.md) | [Español](../es/linux-jcef-blank-panel.md) | [Deutsch](../de/linux-jcef-blank-panel.md) | **Français**

_Dernière mise à jour : 2026-09-08_

## Symptômes

L'onglet de discussion s'ouvre, mais son contenu reste entièrement vide.

Le texte `Waiting for project indexing...` apparaît un instant, disparaît, et rien ne vient le remplacer.

Aucun message d'erreur ni panneau d'information ne s'affiche. L'onglet reste simplement vide.

## Vérifiez d'abord ceci

Ouvrez n'importe quel fichier `.md` dans le même IDE et activez son aperçu Markdown.

**Si l'aperçu Markdown est vide lui aussi, ce document est bien le vôtre.**

Cet aperçu est dessiné par l'IDE lui-même, pas par cette extension. Lorsque les deux affichages se vident en même temps, le problème vient du navigateur intégré de l'IDE (JCEF) et non d'une extension en particulier.

Cette simple vérification fait gagner beaucoup de temps, car de l'extérieur un onglet de discussion vide et un JCEF en panne se ressemblent exactement.

## Environnements concernés

Le problème survient sous Linux.

Il a été confirmé sous Ubuntu 22.04 avec PhpStorm 2026.2.2, sur une machine équipée d'une carte graphique NVIDIA dans une session Wayland.

La personne qui l'a signalé avait modifié plusieurs valeurs de registre liées à JCEF par rapport à leurs valeurs par défaut, afin de contourner un autre problème lié à Wayland.

Deux éléments rendent le problème plus probable :

- une session **Wayland** plutôt que X11
- le pilote propriétaire **NVIDIA**

## Cause

Cette extension dessine son interface de discussion sur **JCEF** (Chromium Embedded Framework), le composant que l'IDE utilise également pour son aperçu Markdown et son navigateur intégré.

JCEF effectue son rendu via le GPU. Lorsque ce chemin ne fonctionne pas avec une combinaison donnée de pilote et de session, le navigateur est bien créé, mais aucune image n'est jamais dessinée, et le panneau reste vide.

Nous ne détectons pas encore ce cas. Lorsque JCEF est inutilisable, ou lorsque notre backend ne démarre pas, nous remplaçons l'espace réservé par un panneau qui explique la situation. Un JCEF qui démarre normalement puis ne dessine jamais ressemble à une réussite de notre côté, et c'est pourquoi vous vous retrouvez avec un onglet vide et sans message.

## Comment le résoudre

Essayez dans cet ordre. C'est l'étape 1 qui a résolu le cas signalé.

### 1. Remettez les valeurs de registre de JCEF à leurs valeurs par défaut

Ouvrez `Help → Find Action`, lancez **Registry…**, puis recherchez `jcef`.

Vérifiez ces quatre entrées et restaurez celles qui ne sont plus à leur valeur par défaut.

| Entrée | Valeur par défaut |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

Les entrées modifiées apparaissent en gras, et la boîte de dialogue du registre comporte un bouton **Restore Defaults**.

Redémarrez ensuite l'IDE.

Des valeurs activées pour contourner un autre problème lié à Wayland sont une raison fréquente d'en arriver là.

### 2. Basculez la session sur X11

Déconnectez-vous et choisissez une session **X11** (ou « Xorg ») sur l'écran de connexion, au lieu de Wayland.

Si vous préférez garder votre bureau sous Wayland, vous pouvez ne basculer que l'IDE sur XWayland. Ouvrez `Help → Edit Custom VM Options`, ajoutez la ligne ci-dessous et redémarrez.

```
-Dawt.toolkit.name=XToolkit
```

Si une ligne commençant par `-Dawt.toolkit.name=` existe déjà, remplacez-la.

### 3. Seulement si les deux premières étapes n'ont rien changé, désactivez l'accélération GPU

Cette étape va dans le sens inverse de l'étape 1, ne l'essayez donc qu'après l'échec de l'étape 1.

Dans **Registry…**, passez `ide.browser.jcef.gpu.disable` à `true` et redémarrez.

JetBrains a proposé exactement cela à une personne dont le navigateur intégré s'affichait vide, et le rendu est réapparu ([IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)).

## À garder à l'esprit

**Notez la valeur d'origine avant de modifier une entrée du registre.** Ces réglages affectent toutes les parties de l'IDE qui utilisent le navigateur intégré, pas seulement cette extension.

Passer à X11 ou XWayland ramène l'IDE sur l'ancien chemin d'affichage. **L'écran peut donc paraître flou si vous utilisez une mise à l'échelle fractionnaire comme 125 % ou 150 %.** C'est un contournement, et vous pouvez le défaire.

En désactivant l'accélération GPU, JCEF effectue son rendu sur le processeur, ce qui peut être plus lent sur les pages lourdes.

## Si rien ne fonctionne

Dans cette situation, JetBrains demande un journal JCEF détaillé.

Ajoutez la ligne ci-dessous dans `Help → Edit Custom VM Options`, redémarrez, reproduisez l'onglet vide, puis récupérez le fichier `~/jcef_<PID>.log`.

```
-Dide.browser.jcef.log.level=verbose
```

Merci de joindre ce fichier lorsque vous [ouvrez un ticket](https://github.com/Swttch/swttch/issues/new/choose), avec votre distribution, votre type de session (Wayland ou X11) et votre pilote graphique.

## Quand cela disparaîtra-t-il

Ce contournement deviendra inutile dès que JCEF dessinera de façon fiable sur ces combinaisons de pilote et de session.

Les tickets ci-dessous sont encore ouverts, et voter pour eux aide à en relever la priorité.

Nous examinons également si l'extension peut détecter un navigateur qui ne dessine jamais, afin de vous l'indiquer à l'écran plutôt que de vous laisser un onglet vide.

## Liens connexes

### Tickets de ce dépôt

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### Tickets JetBrains

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — un navigateur intégré qui s'affiche vide sous Linux, attribué à une erreur VA-API. **Toujours ouvert, et vous pouvez voter.** JetBrains y a suggéré `ide.browser.jcef.gpu.disable`, et la personne à l'origine du signalement a confirmé que cela fonctionnait
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — l'accélération GPU qui casse JCEF sous Linux avec le pilote NVIDIA, et la demande d'un moyen fiable de la désactiver. **Toujours ouvert**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — la prise en charge native de Wayland elle-même, toujours en cours
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — le même symptôme d'écran blanc, fermé en Incomplete faute d'informations suffisantes

### Documents connexes

- [Presse-papiers sous Wayland](wayland-clipboard.md) — l'autre problème lié à Wayland, où le collage dans le champ de saisie du chat échoue
